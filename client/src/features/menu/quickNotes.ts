// Notas rápidas ("Sem cebola", "Bem passado"…): un toque las agrega a la nota de un producto y
// otro toque las saca. La nota queda como texto, separada por comas, igual que si se escribiera.
const parts = (notes: string) =>
  notes
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export const hasQuickNote = (notes: string, note: string) => parts(notes).some((part) => part.toLowerCase() === note.toLowerCase());

export function toggleQuickNote(notes: string, note: string, max = 140): string {
  const current = parts(notes);
  const next = hasQuickNote(notes, note) ? current.filter((part) => part.toLowerCase() !== note.toLowerCase()) : [...current, note];
  const joined = next.join(", ");
  // Si ya no entra, queda como estaba.
  return joined.length > max ? notes : joined;
}
