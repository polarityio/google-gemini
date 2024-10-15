'use strict';

polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  question: '',
  isRunning: false,
  errorMessage: '',
  tokenCount: 0,
  // If the user's chat message reaches this number of tokens, we will display a warning
  // suggesting they clear their chat.
  tokenWarningAmount: 8000, // actual limit is 8196
  init() {
    let array = new Uint32Array(5);
    this.set('uniqueIdPrefix', window.crypto.getRandomValues(array).join(''));

    this._super(...arguments);
  },
  actions: {
    clearChat: function () {
      this.set('details.responses', []);
    },
    copyData: function () {
      Ember.run.scheduleOnce(
        'afterRender',
        this,
        this.copyElementToClipboard,
        `googleai-${this.get('uniqueIdPrefix')}`
      );

      Ember.run.scheduleOnce('destroy', this, this.restoreCopyState);
    },
    submitQuestion: function () {
      this.submitQuestion();
    },
    acceptDisclaimer: function () {
      this.set('details.showDisclaimer', false);
      this.set('details.acceptedDisclaimer', true);
      this.submitQuestion();
    },
    declineDisclaimer: function () {
      const payload = {
        action: 'declineDisclaimer',
        search: this.get('details.responses')
      };

      this.sendIntegrationMessage(payload)
        .then((result) => {
          this.set('details.responses', []);
          this.set('details.showDisclaimer', false);
          this.set('details.disclaimerDeclined', true);
        })
        .catch((error) => {
          console.error(error);
          this.set('errorMessage', JSON.stringify(error, null, 2));
          Ember.run.scheduleOnce('afterRender', this, this.scrollToErrorMessage);
        });
    },
    closeError: function () {
      this.set('errorMessage', '');
    }
  },
  submitQuestion() {
    if (this.get('isRunning') === true) {
      return;
    }

    this.set('isRunning', true);
    let responses = this.get('details.responses');

    // Remove errors if we had one
    if (
      this.get('details.responses').length > 1 &&
      this.get('details.responses')[this.get('details.responses').length - 1].author ===
        'system-error'
    ) {
      this.get('details.responses').pop();
      this.get('details.responses').pop();
    }

    // If we're showing the disclaimer then there will be no question
    // and we don't need to add anything to the choices array.
    if (this.get('question')) {
      responses.push({
        role: 'user',
        parts: [
          {
            text: this.get('question')
          }
        ]
      });
    }
    this.set('details.disclaimerDeclined', false);
    this.get('block').notifyPropertyChange('data');

    Ember.run.scheduleOnce('afterRender', this, this.scrollToElementRunningIndicator);

    const payload = {
      action: 'question',
      responses,
      acceptedDisclaimer: this.get('details.acceptedDisclaimer')
        ? this.get('details.acceptedDisclaimer')
        : false
    };

    this.set('question', '');

    this.sendIntegrationMessage(payload)
      .then((result) => {
        this.set('details.responses', result.responses);
        const responses = this.get('details.responses');
        this.set('tokenCount', result.tokenCount);
        Ember.run.scheduleOnce(
          'afterRender',
          this,
          this.scrollToResponseIndex,
          responses.length - 1
        );
      })
      .catch((error) => {
        console.error(error);
        this.set('errorMessage', JSON.stringify(error, null, 2));
        Ember.run.scheduleOnce('afterRender', this, this.scrollToErrorMessage);
      })
      .finally(() => {
        this.set('details.acceptedDisclaimer', false);
        this.set('isRunning', false);
      });
  },
  scrollToResponseIndex(index) {
    let doc = document.getElementById(`googleai-choice-${index}-${this.get('uniqueIdPrefix')}`);
    if (doc) {
      doc.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  },
  scrollToElementRunningIndicator() {
    let doc = document.getElementById(`googleai-running-indicator-${this.get('uniqueIdPrefix')}`);
    if (doc) {
      doc.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  },
  scrollToErrorMessage() {
    let doc = document.getElementById(`googleai-error-message-${this.get('uniqueIdPrefix')}`);
    if (doc) {
      doc.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  },
  copyElementToClipboard(element) {
    // Prevents avatar images from being copied as they don't display right in MS Word
    let images = document.getElementById(element).getElementsByTagName('img');
    for (let i = 0; i < images.length; i++) {
      images[i].style.display = 'none';
    }

    window.getSelection().removeAllRanges();
    let range = document.createRange();

    range.selectNode(typeof element === 'string' ? document.getElementById(element) : element);
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();

    for (let i = 0; i < images.length; i++) {
      images[i].style.display = 'block';
    }
  },
  restoreCopyState() {
    this.set('showCopyMessage', true);

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.set('showCopyMessage', false);
      }
    }, 2000);
  }
});
