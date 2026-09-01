export function createStatus(container) {
  const message = document.createElement('span');
  const midi = document.createElement('span');
  midi.className = 'midi-state';
  midi.textContent = 'MIDI: not connected';
  container.append(message, midi);

  function show(text, isError) {
    message.textContent = text;
    container.classList.toggle('error', isError);
  }

  return {
    info: (msg) => show(msg, false),
    error: (msg) => show(`ERROR: ${msg}`, true),
    setMidi: (state) => {
      midi.textContent = `MIDI: ${state}`;
    },
  };
}
