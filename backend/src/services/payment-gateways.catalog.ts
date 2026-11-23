export type NestpayBankDefinition = {
  id: string;
  name: string;
  shortName: string;
  production3dUrl: string;
  productionApiUrl: string;
  sandbox3dUrl: string;
  sandboxApiUrl: string;
};

// Standard NestPay / Payten (EST v3) banks sharing the same protocol with bank-specific endpoints.
export const nestpayBanks: readonly NestpayBankDefinition[] = [
  {
    id: 'isbank',
    name: 'İş Bankası Sanal POS',
    shortName: 'İş Bankası',
    production3dUrl: 'https://sanalpos.isbank.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://sanalpos.isbank.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
  {
    id: 'ziraat',
    name: 'Ziraat Bankası Sanal POS',
    shortName: 'Ziraat Bankası',
    production3dUrl: 'https://sanalpos2.ziraatbank.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://sanalpos2.ziraatbank.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
  {
    id: 'halkbank',
    name: 'Halkbank Sanal POS',
    shortName: 'Halkbank',
    production3dUrl: 'https://sanalpos.halkbank.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://sanalpos.halkbank.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
  {
    id: 'teb',
    name: 'TEB Sanal POS',
    shortName: 'TEB',
    production3dUrl: 'https://sanalpos.teb.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://sanalpos.teb.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
  {
    id: 'sekerbank',
    name: 'Şekerbank Sanal POS',
    shortName: 'Şekerbank',
    production3dUrl: 'https://sanalpos.sekerbank.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://sanalpos.sekerbank.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
  {
    id: 'ing',
    name: 'ING Sanal POS',
    shortName: 'ING',
    production3dUrl: 'https://sanalpos.ingbank.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://sanalpos.ingbank.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
  {
    id: 'anadolubank',
    name: 'Anadolubank Sanal POS',
    shortName: 'Anadolubank',
    production3dUrl: 'https://anadolusanalpos.est.com.tr/fim/est3Dgate',
    productionApiUrl: 'https://anadolusanalpos.est.com.tr/fim/api',
    sandbox3dUrl: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
    sandboxApiUrl: 'https://entegrasyon.asseco-see.com.tr/fim/api',
  },
] as const;

const bankMap = new Map(nestpayBanks.map(bank => [bank.id, bank]));

export const nestpayProviderIds = nestpayBanks.map(bank => bank.id);
export const allPaymentProviderIds = ['iyzico', 'akbank', ...nestpayProviderIds];
export const isNestpayProvider = (id: string) => bankMap.has(id);
export const getNestpayBank = (id: string) => bankMap.get(id) ?? null;
export const paymentProviderLabel = (id: string) =>
  id === 'akbank' ? 'Akbank' : id === 'iyzico' ? 'iyzico' : bankMap.get(id)?.shortName ?? 'Ödeme sağlayıcısı';
