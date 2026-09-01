export function showBootScreen(onEnter) {
  const boot = document.getElementById('boot');
  boot.innerHTML = `
    <h1>CRT STRUDEL</h1>
    <p>click to power on</p>
  `;
  boot.addEventListener(
    'click',
    async () => {
      boot.querySelector('p').textContent = 'warming up...';
      await onEnter();
      boot.remove();
      document.getElementById('app').hidden = false;
    },
    { once: true },
  );
}
