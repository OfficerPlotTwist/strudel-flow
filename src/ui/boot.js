export function showBootScreen(onEnter, { onError } = {}) {
  const boot = document.getElementById('boot');
  boot.innerHTML = `
    <h1>CRT STRUDEL</h1>
    <p>click to power on</p>
  `;
  boot.addEventListener(
    'click',
    async () => {
      boot.querySelector('p').textContent = 'warming up...';
      let error = null;
      try {
        await onEnter();
      } catch (err) {
        error = err;
      } finally {
        // No matter what onEnter did, the app must reveal itself - a failed
        // boot step must never leave the user stuck on this screen forever.
        boot.remove();
        document.getElementById('app').hidden = false;
      }
      // Report after the app (and its status strip) is visible, so the
      // error actually reaches the user instead of vanishing into the
      // console behind the still-hidden #app.
      if (error) onError?.(error);
    },
    { once: true },
  );
}
