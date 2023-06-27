module.exports = {
  name: 'Google Chat AI',
  acronym: 'AI',
  defaultColor: 'light-gray',
  description: "Ask Google's Chat AI a question and get an answer",
  customTypes: [
    {
      key: 'question',
      regex: /^(?<!\n|\r\n)[ \t]*.{5,256}\?[ \t]*(?!\n|\r\n)$/
    }
  ],
  onDemandOnly: true,
  styles: ['./styles/styles.less'],
  block: {
    component: {
      file: './components/block.js'
    },
    template: {
      file: './templates/block.hbs'
    }
  },
  auth: {
    // Path to google drive private key file
    key: './key/bard-credentials.json'
  },
  request: {
    // Provide the path to your certFile. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    cert: '',
    // Provide the path to your private key. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    key: '',
    // Provide the key passphrase if required.  Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    passphrase: '',
    // Provide the Certificate Authority. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    ca: '',
    // An HTTP proxy to be used. Supports proxy Auth with Basic Auth, identical to support for
    // the url parameter (by embedding the auth info in the uri)
    proxy: ""
  },
  logging: { level: 'trace' },
  options: [
    // {
    //   key: 'apiKey',
    //   name: 'API Key',
    //   description: 'A Google Chat AI Access Token.  The token must have access to the Google Vertex AI API',
    //   default: '',
    //   type: 'password',
    //   userCanEdit: false,
    //   adminOnly: true
    // },
    {
      key: 'gcloudPath',
      name: 'GCloud CLI tool',
      description: 'The absolute path to the GCloud CLI executable installed on your Polarity Server',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'project',
      name: 'Project Id',
      description: 'The Google project id',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'model',
      name: 'Google Vertex AI Model',
      description:
        'The ID of the model to use when accessing Google Chat AI API.  Your API key must have access to the model or you will receive a 404 error.',
      default: {
        value: 'chat-bison@001',
        display: 'chat-bison@001'
      },
      type: 'select',
      options: [
        {
          value: 'chat-bison@001',
          display: 'chat-bison@001'
        }
      ],
      multiple: false,
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'showDisclaimer',
      name: 'Show Search Disclaimer',
      description:
        'If enabled, the integration will show a disclaimer the user must accept before running a search.',
      default: false,
      type: 'boolean',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'disclaimer',
      name: 'Search Disclaimer Content',
      description:
        'A disclaimer that users must review before the integration will submit questions to Google Chat AI API.',
      default:
        'Please affirm that no confidential information will be shared with your submission to Google. Click Accept to run your search.',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'disclaimerInterval',
      name: 'Disclaimer Interval',
      description:
        'How often to display the disclaimer to users. Restarting the integration will reset the interval timer.',
      default: {
        value: 'all',
        display: 'All searches - disclaimer will be shown before every search (default)'
      },
      type: 'select',
      options: [
        {
          value: 'all',
          display: 'All searches - disclaimer will be shown before every new search (default)'
        },
        {
          value: '24',
          display: 'Every 24 hours - disclaimer will be shown once per day'
        },
        {
          value: '168',
          display: 'Every week - disclaimer will be shown once per week'
        }
      ],
      multiple: false,
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'logSearches',
      name: 'Log Searches',
      description:
        'If enabled, the integration will log all searches sent to Google including searches where the user did not accept the disclaimer.',
      default: false,
      type: 'boolean',
      userCanEdit: false,
      adminOnly: true
    }
  ]
};
