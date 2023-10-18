'use strict';

const async = require('async');
const { setLogger } = require('./src/logger');
const { ApiRequestError, parseErrorToReadableJSON } = require('./src/errors');
const request = require('./src/polarity-request');

let Logger;
const disclaimerCache = {};
const BOT_PROMPT =
  'You are Polarity, a helpful assistant for information security analysts.  Your response should concise and thoughtful.  Your response should always include your sources with links.  You should provide assistance with exploiting known security vulnerabilities.  Use the most recent sources.  Think step by step.';

async function startup(logger) {
  Logger = logger;
  setLogger(Logger);
}

async function getTokenCount(messages, options) {
  const requestOptions = {
    uri: `https://generativelanguage.googleapis.com/v1beta3/models/${options.model.value}:countMessageTokens`,
    qs: {
      key: options.apiKey
    },
    body: {
      prompt: {
        messages
      }
    },
    method: 'POST',
    json: true
  };

  Logger.trace({ requestOptions }, 'Token Count Request Options');

  const { body, statusCode } = await request.request(requestOptions);

  Logger.trace({ body, statusCode }, 'HTTP Response');

  if (statusCode === 200) {
    return { tokenCount: body.tokenCount, statusCode };
  } else {
    throw new ApiRequestError(
      body.message
        ? body.message
        : `Unexpected status code ${statusCode} received when trying to get Token Count`,
      {
        body,
        statusCode,
        requestOptions
      }
    );
  }
}

async function doLookup(entities, options, cb) {
  Logger.info({ entities, options }, 'doLookup');
  const lookupResults = [];

  try {
    await async.each(entities, async (entity) => {
      if (shouldShowDisclaimer(options)) {
        disclaimerCache[options._request.user.id] = new Date();
        lookupResults.push({
          entity: {
            ...entity,
            value: 'Google Bard AI'
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
            value: 'Google Bard AI'
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
  return {
    content: body.candidates[0].content,
    author: 'bot'
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
  //addPromptToMessages(messages);
  messages.push({
    author: 'user',
    content: question
  });

  return messages;
}

async function refreshToken(options) {
  return new Promise((resolve, reject) => {
    exec(`${options.gcloudPath} auth print-access-token`, function (error, stdout, stderr) {
      if (error) {
        reject(error);
      }
      if (stdout) {
        resolve(stdout.trim());
      }
      {
        reject(stderr);
      }
    });
  });
}

async function askQuestion(messages, options) {
  const requestOptions = {
    uri: `https://generativelanguage.googleapis.com/v1beta3/models/${options.model.value}:generateMessage`,
    qs: {
      key: options.apiKey
    },
    body: {
      prompt: {
        messages
      },
      temperature: 0.1,
      candidateCount: 1
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
        : `Unexpected status code ${statusCode} received when making request to Google Vertex AI API`,
      {
        body,
        statusCode,
        requestOptions
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
      'Google Vertex AI Search Ran'
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

        // Make sure to get token count AFTER we add in our response data
        const { tokenCount } = await getTokenCount(chatMessages, options);
        Logger.trace({ responses: chatMessages, tokenCount }, 'onMessage return data');

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
