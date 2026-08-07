(() => {
  const carousel = document.querySelector('[data-carousel]');
  if (!carousel) return;

  const track = carousel.querySelector('[data-carousel-track]');
  const prevBtn = carousel.querySelector('[data-carousel-prev]');
  const nextBtn = carousel.querySelector('[data-carousel-next]');
  const dotsHost = carousel.querySelector('[data-carousel-dots]');
  const slides = [...carousel.querySelectorAll('[data-carousel-slide]')];

  const AUTOPLAY_MS = 5000;
  const AUTOPLAY_PAUSE_MS = 30000;

  let index = 0;
  let autoplayTimer = null;
  let pausedUntil = 0;

  function goTo(nextIndex, announce = true) {
    const count = slides.length;
    index = ((nextIndex % count) + count) % count;
    track.style.transform = `translateX(-${index * 100}%)`;
    renderDots();
    updateSlideStates();
    if (announce) {
      carousel.setAttribute('aria-live', 'polite');
      window.setTimeout(() => carousel.removeAttribute('aria-live'), 1000);
    }
  }

  function next() {
    goTo(index + 1);
  }

  function prev() {
    goTo(index - 1);
  }

  function updateSlideStates() {
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.setAttribute('aria-hidden', String(!active));
      if (active) {
        slide.removeAttribute('inert');
      } else {
        slide.setAttribute('inert', '');
      }
    });
  }

  function renderDots() {
    dotsHost.innerHTML = '';
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Show screenshot ${i + 1} of ${slides.length}`);
      dot.setAttribute('aria-selected', String(i === index));
      dot.addEventListener('click', () => {
        scheduleAutoplay();
        goTo(i);
      });
      dotsHost.appendChild(dot);
    });
  }

  function scheduleAutoplay() {
    if (autoplayTimer !== null) {
      window.clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
    pausedUntil = Date.now() + AUTOPLAY_PAUSE_MS;
    autoplayTimer = window.setTimeout(() => {
      if (document.hidden) {
        scheduleAutoplay();
        return;
      }
      if (Date.now() < pausedUntil) {
        scheduleAutoplay();
        return;
      }
      next();
      scheduleAutoplay();
    }, AUTOPLAY_MS);
  }

  prevBtn.addEventListener('click', () => {
    scheduleAutoplay();
    prev();
  });

  nextBtn.addEventListener('click', () => {
    scheduleAutoplay();
    next();
  });

  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      scheduleAutoplay();
      prev();
    } else if (e.key === 'ArrowRight') {
      scheduleAutoplay();
      next();
    }
  });

  const pause = () => {
    if (autoplayTimer !== null) {
      window.clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
  };

  const resume = () => scheduleAutoplay();

  carousel.addEventListener('mouseenter', pause);
  carousel.addEventListener('mouseleave', resume);
  carousel.addEventListener('focusin', pause);
  carousel.addEventListener('focusout', resume);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else scheduleAutoplay();
  });

  renderDots();
  updateSlideStates();
  scheduleAutoplay();
})();
