// Currency display only: amounts are never converted between currencies.
const regions = {
  IN: ['INR', '91'], US: ['USD', '1'], CA: ['CAD', null], GB: ['GBP', '44'],
  AU: ['AUD', '61'], NZ: ['NZD', '64'], AE: ['AED', '971'], SA: ['SAR', '966'],
  QA: ['QAR', '974'], KW: ['KWD', '965'], BH: ['BHD', '973'], OM: ['OMR', '968'],
  NP: ['NPR', '977'], BD: ['BDT', '880'], PK: ['PKR', '92'], LK: ['LKR', '94'],
  SG: ['SGD', '65'], MY: ['MYR', '60'], TH: ['THB', '66'], ID: ['IDR', '62'],
  PH: ['PHP', '63'], VN: ['VND', '84'], JP: ['JPY', '81'], CN: ['CNY', '86'],
  KR: ['KRW', '82'], HK: ['HKD', '852'], TW: ['TWD', '886'], ZA: ['ZAR', '27'],
  NG: ['NGN', '234'], KE: ['KES', '254'], GH: ['GHS', '233'], EG: ['EGP', '20'],
  BR: ['BRL', '55'], MX: ['MXN', '52'], CH: ['CHF', '41'], SE: ['SEK', '46'],
  NO: ['NOK', '47'], DK: ['DKK', '45'], PL: ['PLN', '48'], TR: ['TRY', '90'],
  DE: ['EUR', '49'], FR: ['EUR', '33'], IT: ['EUR', '39'], ES: ['EUR', '34'],
  PT: ['EUR', '351'], NL: ['EUR', '31'], BE: ['EUR', '32'], IE: ['EUR', '353'],
  AT: ['EUR', '43'], FI: ['EUR', '358'], GR: ['EUR', '30'],
};
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countryCodes = new Map(Object.keys(regions).flatMap(code => [[code.toLowerCase(), code], [names.of(code).toLowerCase(), code]]));
for (const [alias, code] of Object.entries({ usa: 'US', uk: 'GB', uae: 'AE', 'united states of america': 'US', 'great britain': 'GB', 'south korea': 'KR' })) countryCodes.set(alias, code);

export function countryFromPhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  const digits = phone.slice(1);
  // +1 is shared across North America; country must come from other evidence.
  if (digits.startsWith('1')) return null;
  const entry = Object.entries(regions).filter(([, [, prefix]]) => prefix && digits.startsWith(prefix))
    .sort((a, b) => b[1][1].length - a[1][1].length)[0];
  if (!entry) return null;
  const national = digits.slice(entry[1][1].length);
  if (national.length < 7 || national.length > 12 || (entry[0] === 'IN' && !/^[6-9]\d{9}$/.test(national))) return null;
  return entry[0];
}

export function resolveCurrency(profile = {}, suppliers = []) {
  const votes = new Map();
  for (const supplier of suppliers) {
    const international = countryFromPhone(supplier.phone);
    // Imported Indian mobiles are often stored without +91. Require several
    // matching suppliers and an absolute majority, rather than one local number.
    const localIndian = /^[6-9]\d{9}$/.test(String(supplier.phone || '').replace(/[\s()-]/g, ''));
    const region = international || (localIndian ? 'IN' : null);
    if (region) votes.set(region, (votes.get(region) || 0) + 1);
  }
  const winner = [...votes].sort((a, b) => b[1] - a[1])[0];
  if (winner && winner[1] >= 3 && winner[1] > suppliers.length / 2) return currencyForCountry(winner[0]);
  const country = countryCodes.get(String(profile.country || '').trim().toLowerCase());
  if (country) return currencyForCountry(country);
  const phoneCountry = countryFromPhone(profile.phone);
  if (phoneCountry) return currencyForCountry(phoneCountry);
  // This pharmacy's deployment default; ambiguous phone numbers do not override it.
  return currencyForCountry('IN');
}

export function currencyForCountry(country) {
  const currency = regions[country]?.[0] || 'INR';
  const locale = `en-${country in regions ? country : 'IN'}`;
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return {
    currency, country, locale,
    symbol: formatter.formatToParts(0).find(part => part.type === 'currency').value,
    formatMoney: value => formatter.format(Number(value)),
  };
}
