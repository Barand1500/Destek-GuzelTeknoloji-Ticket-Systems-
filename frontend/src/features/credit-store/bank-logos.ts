/** Bundled official bank logos, keyed by the backend bankKey. */
export const bankLogos: Record<string, string> = {
  garanti: "/images/banks/garanti.svg",
  enpara: "/images/banks/enpara.svg",
  ziraat: "/images/banks/ziraat.svg",
  isbank: "/images/banks/isbank.png",
  akbank: "/images/banks/akbank.svg",
  yapikredi: "/images/banks/yapikredi.png",
  qnb: "/images/banks/qnb.png",
  denizbank: "/images/banks/denizbank.svg",
  teb: "/images/banks/teb.png",
  vakifbank: "/images/banks/vakifbank.svg",
  halkbank: "/images/banks/halkbank.svg",
  sekerbank: "/images/banks/sekerbank.svg",
  ing: "/images/banks/ing.png",
  hsbc: "/images/banks/hsbc.png",
  kuveytturk: "/images/banks/kuveytturk.svg",
  albaraka: "/images/banks/albaraka.svg",
  turkiyefinans: "/images/banks/turkiyefinans.png",
  fibabanka: "/images/banks/fibabanka.png",
  anadolubank: "/images/banks/anadolubank.svg",
};

export const bankLogo = (key?: string | null) => (key ? bankLogos[key] : undefined);
