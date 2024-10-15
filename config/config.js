module.exports = {
  polarityIntegrationUuid: '721d48e0-6f51-11ee-b480-157aad187429',
  name: 'Google Gemini',
  acronym: 'AI',
  defaultColor: 'light-gray',
  description: 'Ask Google Gemini a question and get an answer',
  customTypes: [
    {
      key: 'question',
      regex: '^(?<!\\n|\\r\\n)[ \\t]*.{5,256}\\?[ \\t]*(?!\\n|\\r\\n)$'
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
  request: {
    cert: '',
    key: '',
    passphrase: '',
    ca: '',
    proxy: ''
  },
  logging: {
    level: 'info'
  },
  options: [
    {
      key: 'apiKey',
      name: 'Google Cloud API Key',
      description: 'A Google Cloud API key that has access to the Google Gemini API',
      default: '',
      type: 'password',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'model',
      name: 'Google Gemini Language Model',
      description:
        'The ID of the model to use when accessing Google Chat AI API.  Your API key must have access to the model or you will receive a 404 error.',
      default: {
        value: 'gemini-1.5-pro-latest',
        display: 'gemini-1.5-pro-latest (Complex reasoning tasks requiring more intelligence)'
      },
      type: 'select',
      options: [
        {
          value: 'gemini-1.5-pro-latest',
          display: 'gemini-1.5-pro-latest (Complex reasoning tasks requiring more intelligence)'
        },
        {
          value: 'gemini-1.5-flash-latest',
          display:
            'gemini-1.5-flash-latest (Fast and versatile performance across a diverse variety of tasks)'
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
        'A disclaimer that users must review before the integration will submit questions to the Google Gemini API.',
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
