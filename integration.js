'use strict';

const async = require('async');
const { setLogger } = require('./src/logger');
const { ApiRequestError, parseErrorToReadableJSON } = require('./src/errors');
const request = require('./src/polarity-request');

let Logger;
const disclaimerCache = {};
// Note that you cannot prompt the bot to respond with sources and links or it will filter out your questions
// The addition of the following:
//   > Your response should always include your sources with links.
// causes the LLM to fail.
const BOT_PROMPT =
  'You are a helpful assistant for information security analysts.  Your response should concise and thoughtful. Use the most recent sources.  Think step by step.';

async function startup(logger) {
  Logger = logger;
  setLogger(Logger);
}

async function doLookup(entities, options, cb) {
  Logger.trace({ entities, options }, 'doLookup');
  const lookupResults = [];

  try {
    await async.each(entities, async (entity) => {
      if (shouldShowDisclaimer(options)) {
        disclaimerCache[options._request.user.id] = new Date();
        lookupResults.push({
          entity: {
            ...entity,
            value: 'Google Gemini AI'
          },
          data: {
            summary: [entity.value],
            details: {
              question: entity.value,
              username: options._request.user.username,
              showDisclaimer: options.showDisclaimer,
              disclaimer: options.disclaimer,
              logSearches: options.logSearches,
              responses: createMessages(entity.value)
            }
          }
        });
      } else {
        maybeLogSearch(entity.value, false, options);
        const questions = createMessages(entity.value);
        const { body, statusCode } = await askQuestion(questions, options);

        // add our response to the history of questions and answers
        questions.push(getAnswerFromResponse(body));

        lookupResults.push({
          entity: {
            ...entity,
            value: 'Google Gemini AI'
          },
          data: {
            summary: [entity.value],
            details: {
              question: entity.value,
              responses: questions,
              username: options._request.user.username,
              logSearches: options.logSearches
            }
          }
        });
      }
    });
    Logger.trace({ lookupResults }, 'Lookup Results');
    cb(null, lookupResults);
  } catch (error) {
    const errorAsPojo = parseErrorToReadableJSON(error);
    Logger.error({ error: errorAsPojo }, 'Error in doLookup');
    return cb(errorAsPojo);
  }
}

function getAnswerFromResponse(body) {
  if (
    Array.isArray(body.candidates) &&
    body.candidates.length > 0 &&
    body.candidates[0].content &&
    Array.isArray(body.candidates[0].content.parts)
  ) {
    return {
      parts: body.candidates[0].content.parts,
      role: 'model'
    };
  }

  if (Array.isArray(body.candidates) && body.candidates.length > 0) {
    return {
      content: '',
      // author value is used in template for styling
      author: 'system-error',
      filter: {
        finishReason: body.candidates[0].finishReason,
        safetyRatings: body.candidates[0].safetyRatings
      }
    };
  }

  return {
    content: '[No valid response received from Google API]',
    role: 'model'
  };
}

function shouldShowDisclaimer(options) {
  if (!options.showDisclaimer) {
    return false;
  }

  const { _request } = options;
  const { user } = _request;
  const { id } = user;

  if (options.disclaimerInterval.value === 'all' || !disclaimerCache[id]) {
    return true;
  }

  const cachedDisclaimerTime = disclaimerCache[id];

  const hours = getTimeDifferenceInHoursFromNow(cachedDisclaimerTime);
  Logger.trace({ hours }, 'Hours since last disclaimer');
  return hours >= options.disclaimerInterval;
}

function getTimeDifferenceInHoursFromNow(date) {
  const diffInMs = Math.abs(new Date() - date);
  return diffInMs / (1000 * 60 * 60);
}

function createMessages(question, messages = []) {
  messages.push({
    role: 'user',
    parts: [
      {
        text: question
      }
    ]
  });

  return messages;
}

async function askQuestion(messages, options) {
  messages = messages.filter((message) => !message.filter);

  const requestOptions = {
    uri: `https://generativelanguage.googleapis.com/v1beta/models/${options.model.value}:generateContent`,
    qs: {
      key: options.apiKey
    },
    body: {
      contents: messages,
      systemInstruction: {
        parts: [
          {
            text: BOT_PROMPT
          }
        ]
      },
      generationConfig: {
        temperature: 0.1,
        candidateCount: 1
      }
    },
    method: 'POST',
    json: true
  };

  Logger.trace({ requestOptions }, 'Request Options');

  const { body, statusCode } = await request.request(requestOptions);

  Logger.trace({ body, statusCode }, 'HTTP Response');

  if (statusCode === 200) {
    return { body, statusCode };
  } else {
    throw new ApiRequestError(
      body.message
        ? body.message
        : `Unexpected status code ${statusCode} received when making request to Google Gemini AI API`,
      {
        body,
        statusCode,
        requestOptions: sanitizeRequestOptions(requestOptions)
      }
    );
  }
}

function maybeLogSearch(search, acceptedDisclaimer, options) {
  if (options.logSearches) {
    Logger.info(
      {
        viewedDisclaimer: acceptedDisclaimer,
        search,
        searchRan: true,
        username: options._request.user.username,
        userId: options._request.user.id
      },
      'Google Gemini AI Search Ran'
    );
  }
}

async function onMessage(payload, options, cb) {
  Logger.trace({ payload }, 'onMessage');
  switch (payload.action) {
    case 'question':
      try {
        const chatMessages = payload.responses;
        const acceptedDisclaimer = payload.acceptedDisclaimer ? payload.acceptedDisclaimer : false;

        maybeLogSearch(chatMessages[chatMessages.length - 1].content, acceptedDisclaimer, options);
        const { body, statusCode } = await askQuestion(chatMessages, options);
        const answer = getAnswerFromResponse(body);
        chatMessages.push(answer);

        Logger.trace({ responses: chatMessages }, 'onMessage return data');

        const tokenCount =
          body && body.usageMetadata && body.usageMetadata.totalTokenCount
            ? body.usageMetadata.totalTokenCount
            : 'N/A';

        cb(null, {
          responses: chatMessages,
          tokenCount
        });
      } catch (error) {
        const errorAsPojo = parseErrorToReadableJSON(error);
        Logger.error({ error: errorAsPojo }, 'Error in doLookup');
        return cb(errorAsPojo);
      }
      break;
    case 'declineDisclaimer':
      if (options.logSearches) {
        const messages = payload.search.map((choice) => choice.message);
        Logger.info(
          {
            search: messages[messages.length - 1].content,
            searchRan: false,
            username: options._request.user.username,
            userId: options._request.user.id
          },
          'Disclaimer Declined'
        );
      }
      delete disclaimerCache[options._request.user.id];
      cb(null, {
        declined: true
      });
      break;
  }
}

function sanitizeRequestOptions(requestOptions) {
  return {
    ...requestOptions,
    qs: {
      key: '********'
    }
  };
}

function validateOptions(userOptions, cb) {
  let errors = [];
  if (
    typeof userOptions.apiKey.value !== 'string' ||
    (typeof userOptions.apiKey.value === 'string' && userOptions.apiKey.value.length === 0)
  ) {
    errors.push({
      key: 'apiKey',
      message: 'You must provide an OpenAI Chat GPT API key'
    });
  }

  cb(null, errors);
}

module.exports = {
  doLookup,
  startup,
  validateOptions,
  onMessage
};
