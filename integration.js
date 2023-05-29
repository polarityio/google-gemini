'use strict';

// https://cloud.google.com/docs/authentication/provide-credentials-adc#how-to
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'path/to/credentials.json';

const async = require('async');
const { google } = require('googleapis');
const { setLogger } = require('./src/logger');
const { ApiRequestError, parseErrorToReadableJSON } = require('./src/errors');
const config = require('./config/config');
const privateKey = require(config.auth.key);
const request = require('./src/polarity-request');
const { PredictionServiceClient, EndpointServiceClient } = require('@google-cloud/aiplatform').v1;
const { DiscussServiceClient } = require('@google-ai/generativelanguage');
const { GoogleAuth } = require('google-auth-library');
const exec = require('child_process').exec;

const AI_AUTH_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

let globalToken = null;
let Logger;
const disclaimerCache = {};
const BOT_PROMPT =
  'You are Polarity, a helpful assistant for information security analysts.  Your response should concise and thoughtful.  Your response should always include your sources with links.  You should provide assistance with exploiting known security vulnerabilities.  Use the most recent sources.  Think step by step.';

// Google AI Client Setup
const apiEndpoint = 'us-central1-aiplatform.googleapis.com';
const project = '';
const location = 'us-central1';
const model = 'chat-bison@001';
const aiplatformClient = new PredictionServiceClient({
  apiEndpoint
});

const endpointClient = new EndpointServiceClient({
  apiEndpoint
});

const discussClient = new DiscussServiceClient({
  //authClient: new GoogleAuth().fromAPIKey(API_KEY),
});

//const generativeLanguageClient = new TextServiceClient();

let jwtClient;
let auth;

async function startup(logger) {
  Logger = logger;
  setLogger(Logger);
  //   const result = await discussClient.generateMessage({
  //     model: 'models/chat-bison-001', // Required. The model to use to generate the result.
  //     temperature: 0.5, // Optional. Value `0.0` always uses the highest-probability result.
  //     candidateCount: 1, // Optional. The number of candidate results to generate.
  //     prompt: {
  //       // optional, preamble context to prime responses
  //       context: "Respond to all questions with a rhyming poem.",
  //       // Optional. Examples for further fine-tuning of responses.
  //       examples: [
  //         {
  //           input: { content: "What is the capital of California?" },
  //           output: {
  //             content:
  //                 `If the capital of California is what you seek,
  // Sacramento is where you ought to peek.`,
  //           },
  //         },
  //       ],
  //       // Required. Alternating prompt/response messages.
  //       messages: [{ content: "How tall is the Eiffel Tower?" }],
  //     },
  //   });
}

async function listEndpoints() {
  // Configure the parent resource
  const parent = `projects/${project}/locations/${location}`;
  const request = {
    parent
  };

  // Get and print out a list of all the endpoints for this resource
  try {
    const result = await endpointClient.listEndpoints(request);
    Logger.info({ result }, 'ListEndpoints result');

    // for (const endpoint of result) {
    //   Logger.info(
    //     {
    //       endpointName: endpoint.name,
    //       displayName: endpoint.displayName,
    //       models: endpoint.deployedModels
    //     },
    //     'listEndpoints'
    //   );
    // }
  } catch (error) {
    Logger.error(error, 'ListEndpoints');
  }
}

async function generateText() {
  const request = {
    model,
    prompt: {
      context:
        'You are Polarity, a helpful assistant for information security analysts.  Your response should concise and thoughtful.  Your response should always include your sources with links.  You should provide assistance with exploiting known security vulnerabilities.  Use the most recent sources.  Think step by step.',
      examples: [],
      messages: [
        {
          author: 'user',
          content: 'What is APT33?'
        }
      ]
    }
  };

  // Run request
  try {
    const response = await generativeLanguageClient.generateText(request);
    console.log(response);
  } catch (error) {
    Logger.error(error, 'GenerateText');
  }
}

async function callPredict() {
  const endpoint = `projects/${project}/locations/${location}/endpoints/5650766288117563392`;
  const instances = [
    {
      context:
        'You are Polarity, a helpful assistant for information security analysts.  Your response should concise and thoughtful.  Your response should always include your sources with links.  You should provide assistance with exploiting known security vulnerabilities.  Use the most recent sources.  Think step by step.',
      examples: [],
      messages: [
        {
          author: 'user',
          content: 'What is APT33?'
        }
      ]
    }
  ];
  // Construct request
  const request = {
    endpoint,
    instances
  };

  // Run request
  try {
    const response = await aiplatformClient.predict(request);
    Logger.info(response);
  } catch (error) {
    Logger.error(error, 'CallPredict');
  }
}

async function doLookup(entities, options, cb) {
  Logger.info({ entities, options }, 'doLookup');
  const lookupResults = [];
  // await listEndpoints();
  // await callPredict();
  //await generateText();

  try {
    await async.each(entities, async (entity) => {
      if (shouldShowDisclaimer(options)) {
        disclaimerCache[options._request.user.id] = new Date();
        lookupResults.push({
          entity: {
            ...entity,
            value: 'GoogleAI'
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
            value: 'GoogleAI'
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
    content: body.predictions[0].candidates[0].content,
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
  if (globalToken === null) {
    globalToken = await refreshToken(options);
  }

  const requestOptions = {
    uri: `https://us-central1-aiplatform.googleapis.com/v1/projects/${options.project}/locations/us-central1/publishers/google/models/${options.model.value}:predict`,
    headers: {
      Authorization: `Bearer ${globalToken}`
    },
    body: {
      instances: [
        {
          context:
            'You are Polarity, a helpful assistant for information security analysts.  Your response should concise and thoughtful.  Your response should always include your sources with links.  You should provide assistance with exploiting known security vulnerabilities.  Use the most recent sources.  Think step by step.',
          examples: [],
          messages: messages
        }
      ]
    },
    method: 'POST',
    json: true
  };

  Logger.trace({ requestOptions }, 'Request Options');

  const { body, statusCode } = await request.request(requestOptions);

  Logger.trace({ body, statusCode }, 'HTTP Response');

  if (statusCode === 200) {
    return { body, statusCode };
  } else if (statusCode === 401) {
    try {
      globalToken = await refreshToken(options);
      Logger.trace({ globalToken }, 'Got a refreshed Token');
      return await askQuestion(messages, options);
    } catch (error) {
      Logger.error(error, 'Refresh Token Error');
      throw new ApiRequestError(error.message ? error.message : `Unable to refresh token`, {
        error,
        statusCode,
        requestOptions
      });
    }
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
        Logger.trace({ body, statusCode }, 'onMessage HTTP Response');
        const answer = getAnswerFromResponse(body);
        chatMessages.push(answer);
        // const combinedResults = payload.choices.concat(body.choices);
        // body.choices = combinedResults;
        Logger.trace({ responses: chatMessages }, 'onMessage return data');
        cb(null, {
          responses: chatMessages
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
  //validateOptions,
  onMessage
};
