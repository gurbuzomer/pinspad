/** Production PinsPad API origin — not user-configurable in the store build. */
const PINSPAD_BASE_URL = 'https://pinspad.com';

function wirePinsPadDashboardLinks() {
  const url = `${PINSPAD_BASE_URL.replace(/\/$/, '')}/`;
  document.querySelectorAll('[data-pinspad-dashboard]').forEach((el) => {
    el.href = url;
  });
}
