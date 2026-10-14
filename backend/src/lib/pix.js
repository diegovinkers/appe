// Chave Pix: CPF, CNPJ, e-mail, celular o chave aleatória. Atrapa errores de tipeo (un dígito
// de menos, "x") antes de que el cliente le pague a otra persona. La copia del front está en
// client/src/lib/pix.ts.

const digitsOf = (value) => value.replace(/\D/g, "");

function validCpf(cpf) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length) => {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    return ((sum * 10) % 11) % 10 === Number(cpf[length]);
  };
  return check(9) && check(10);
}

function validCnpj(cnpj) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const check = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
    const rest = sum % 11;
    return (rest < 2 ? 0 : 11 - rest) === Number(cnpj[length]);
  };
  return check(12) && check(13);
}

export function isValidPixKey(raw) {
  const key = String(raw ?? "").trim();
  if (!key) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return key.length <= 77;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return true;
  // Lo demás tiene que ser un número (CPF, CNPJ o teléfono), con o sin puntos, guiones, espacios o +.
  if (!/^[\d\s.()/+-]+$/.test(key)) return false;
  const digits = digitsOf(key);
  if (digits.length === 14) return validCnpj(digits);
  // Escrito como CPF (000.000.000-00): tiene que ser un CPF válido.
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(key)) return validCpf(digits);
  // 11 dígitos sueltos: un CPF o un celular con DDD sin el 55 (el tercer dígito es 9).
  if (digits.length === 11) return validCpf(digits) || digits[2] === "9";
  // Teléfono con DDD (10), o con el 55 de Brasil adelante (12 o 13).
  if (digits.length === 10) return true;
  return (digits.length === 12 || digits.length === 13) && digits.startsWith("55");
}
