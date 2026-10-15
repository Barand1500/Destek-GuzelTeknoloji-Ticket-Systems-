export const formatPhone = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length > 2) digits = `0${digits.slice(2)}`;
  else if (digits && digits[0] !== "0") digits = `0${digits}`;
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  const groups = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)].filter(Boolean);
  return groups.join(" ");
};
