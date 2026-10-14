// Copia de backend/src/lib/pix.js: avisa en el panel antes de guardar una chave Pix mal escrita.
// El backend es el que decide.

const digitsOf = (value: string) => value.replace(/\D/g, "");

function validCpf(cpf: string) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    return ((sum * 10) % 11) % 10 === Number(cpf[length]);
  };
  return check(9) && check(10);
}

function validCnpj(cnpj: string) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
    const rest = sum % 11;
    return (rest < 2 ? 0 : 11 - rest) === Number(cnpj[length]);
  };
  return check(12) && check(13);
}

export function isValidPixKey(raw: string): boolean {
  const key = raw.trim();
  if (!key) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return key.length <= 77;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return true;
  if (!/^[\d\s.()/+-]+$/.test(key)) return false;
  const digits = digitsOf(key);
  if (digits.length === 14) return validCnpj(digits);
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(key)) return validCpf(digits);
  if (digits.length === 11) return validCpf(digits) || digits[2] === "9";
  if (digits.length === 10) return true;
  return (digits.length === 12 || digits.length === 13) && digits.startsWith("55");
}
