// El pitido de pedido nuevo. Los navegadores no dejan sonar una página hasta que alguien la
// toca: el primer toque (o tecla) la destraba, y mientras tanto el panel lo avisa en pantalla.
let context: AudioContext | null = null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function unlockSound(): Promise<boolean> {
  try {
    context ??= new AudioContext();
    // Sin un toque previo, resume() puede quedar esperando: no se lo espera más de un momento.
    if (context.state !== "running") await Promise.race([context.resume(), wait(300)]);
    return context.state === "running";
  } catch {
    return false;
  }
}

// Tres pitidos cortos. Devuelve false si el navegador no dejó sonar.
export async function playAlert(): Promise<boolean> {
  if (!(await unlockSound()) || !context) return false;
  for (const delay of [0, 0.22, 0.44]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = delay === 0.44 ? 988 : 740;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime + delay;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  return true;
}
