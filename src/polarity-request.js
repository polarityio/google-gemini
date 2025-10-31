/*
 * Copyright (c) 2023, Polarity.io, Inc.
 */

const request = require('postman-request');
const { getLogger } = require('./logger');
const { NetworkError } = require('./errors');


const defaults = {
  json: true
};

/**
 *
 */
class PolarityRequest {
  constructor() {
    this.requestWithDefaults = request.defaults(defaults);
  }

  async request(requestOptions) {
    return new Promise(async (resolve, reject) => {
      this.requestWithDefaults(requestOptions, (err, response) => {
        if (err) {
          return reject(
            new NetworkError('Unable to complete network request', {
              cause: err,
              requestOptions
            })
          );
        }

        resolve({
          ...response,
          requestOptions
        });
      });
    });
  }
}

module.exports = new PolarityRequest();
