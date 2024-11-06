document.addEventListener('DOMContentLoaded', function() {
  const carouselElement = document.querySelector('#carouselExampleIndicators');
  let touchStartX = 0;
  let touchMoveX = 0;
  let touchEndX = 0;
  const threshold = 40; // Sensitivity for swipe detection

  // Smooth CSS transition
  carouselElement.style.transition = 'transform 0.4s ease-in-out';

  // Detect touch start
  carouselElement.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
  });

  // Detect touch move
  carouselElement.addEventListener('touchmove', function(e) {
      touchMoveX = e.changedTouches[0].screenX;
  });

  // Detect touch end and calculate swipe
  carouselElement.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
  });

  // Handle swipe direction with smoothness
  function handleSwipe() {
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > threshold) {
          if (diff > 0) {
              // Swipe left (Next slide)
              carouselElement.querySelector('.carousel-control-next').click();
          } else {
              // Swipe right (Previous slide)
              carouselElement.querySelector('.carousel-control-prev').click();
          }
      }
  }
});