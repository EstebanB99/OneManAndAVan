(function () {
  const count = document.getElementById("families-served-count");
  if (!count) return;

  const target = 155;
  const duration = 1500;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderCount = (value) => {
    count.textContent = `${value}+`;
  };

  if (prefersReducedMotion) {
    renderCount(target);
    return;
  }

  const startTime = performance.now();
  function animate(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    renderCount(Math.floor(target * easedProgress));

    if (progress < 1) requestAnimationFrame(animate);
  }

  renderCount(0);
  requestAnimationFrame(animate);
})();
