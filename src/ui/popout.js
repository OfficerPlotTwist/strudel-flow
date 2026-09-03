/**
 * A real second browser window (window.open), not a floating pane - the point
 * is to drag it onto a second monitor while the editor stays full-screen.
 *
 * It is a live child of this document, not a navigation: nothing is served for
 * it, we write its DOM directly. That means it must carry its own <style>
 * (a <link> to /src/styles/crt.css would resolve in dev and break in a
 * production build, where Vite hashes the stylesheet into an asset name we
 * cannot know from here).
 */
export function openPopout({ title, css, width = 460, height = 620 }) {
  const win = window.open('', title.replace(/\W+/g, '_'), `popup=yes,width=${width},height=${height}`);
  if (!win) return null; // blocked by the popup blocker - caller reports it

  const doc = win.document;
  // Head is cleared BEFORE the title is set, not after: assigning doc.title
  // creates a <title> element in the head, so wiping the head afterwards
  // deletes the title again and leaves an unnamed window. That matters now
  // that this window is raised automatically at boot - an untitled window is
  // one the performer cannot pick out of a taskbar on a second screen.
  doc.head.innerHTML = '';
  doc.body.innerHTML = '';
  doc.title = title;
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.append(style);

  // A popout outliving its parent would sit there showing a frozen song
  // forever, with no way to reconnect it, so tie its lifetime to ours.
  const closeOnUnload = () => win.close();
  window.addEventListener('beforeunload', closeOnUnload);

  return {
    document: doc,
    body: doc.body,
    focus: () => win.focus(),
    isOpen: () => !win.closed,
    /** Fires when the USER closes the window, so the opener can drop its handle. */
    onClose(cb) {
      win.addEventListener('unload', () => {
        // `unload` also fires on the reload/navigation path; a closed check on
        // the next tick is what distinguishes an actual close.
        setTimeout(() => {
          if (win.closed) cb();
        }, 0);
      });
    },
    close() {
      window.removeEventListener('beforeunload', closeOnUnload);
      win.close();
    },
  };
}
