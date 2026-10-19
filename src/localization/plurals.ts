/* eslint-disable @typescript-eslint/no-require-imports -- Load the bundled polyfill only on Hermes builds that need it. */
// Hermes builds without Intl.PluralRules need CLDR rules before i18next starts.
// Only supported language data is bundled; no network or locale downloads.
if (typeof Intl.PluralRules !== 'function') {
  require('@formatjs/intl-pluralrules/polyfill-force.js');
  require('@formatjs/intl-pluralrules/locale-data/en.js');
  require('@formatjs/intl-pluralrules/locale-data/fil.js');
  require('@formatjs/intl-pluralrules/locale-data/pt.js');
  require('@formatjs/intl-pluralrules/locale-data/es.js');
  require('@formatjs/intl-pluralrules/locale-data/id.js');
  require('@formatjs/intl-pluralrules/locale-data/fr.js');
  require('@formatjs/intl-pluralrules/locale-data/de.js');
  require('@formatjs/intl-pluralrules/locale-data/ja.js');
  require('@formatjs/intl-pluralrules/locale-data/ko.js');
  require('@formatjs/intl-pluralrules/locale-data/it.js');
  require('@formatjs/intl-pluralrules/locale-data/vi.js');
  require('@formatjs/intl-pluralrules/locale-data/hi.js');
  require('@formatjs/intl-pluralrules/locale-data/tr.js');
  require('@formatjs/intl-pluralrules/locale-data/ar.js');
}
