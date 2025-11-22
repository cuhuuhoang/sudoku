const registerSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const { Workbox } = await import('workbox-window');
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      const wb = new Workbox(swUrl);
      wb.addEventListener('waiting', () => {
        wb.messageSkipWaiting();
      });
      wb.register();
    } catch (error) {
      console.error('PWA registration failed', error);
    }
  }
};

export default registerSW;
