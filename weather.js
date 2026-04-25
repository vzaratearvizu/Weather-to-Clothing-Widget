// Imports electron
const { ipcRenderer } = require('electron');

// Gets the hours
function getTimeString(hour) {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return hour + ':00 AM';
  if (hour === 12) return '12:00 PM';
  return (hour - 12) + ':00 PM';
}

// Gets the outfit category
function getOutfit(feelsLike, forecast, gust) {
  let outfit = '';
  const fc = forecast.toLowerCase();

  if (feelsLike <= 44) {
    outfit = 'Thick Jacket';
  } else if (feelsLike <= 50) {
    outfit = 'Medium Jacket/Sweater';
  } else if (feelsLike <= 65) {
    outfit = 'Thin hoodie';
  } else {
    outfit = 'T-shirt';
  }

  if (fc.includes('thunder')) {
    outfit += ', raincoat';
  } else if (fc.includes('rain') || fc.includes('shower')) {
    if (gust >= 25) {
      outfit += ', raincoat (umbrella useless in gusts)';
    } else {
      outfit += ', umbrella';
    }
  }

  if (gust >= 25) {
    outfit += ', watch out for strong gusts';
  }

  return outfit;
}

function getForecastColor(forecast) {
  const fc = forecast.toLowerCase();
  if (fc.includes('thunder')) return '#4a4060';
  if (fc.includes('snow') || fc.includes('blizzard') || fc.includes('sleet')) return '#dde8f0';
  if (fc.includes('rain') || fc.includes('shower') || fc.includes('drizzle')) return '#4a6880';
  if (fc.includes('fog')) return '#7a7a7a';
  if (fc.includes('cloudy') || fc.includes('overcast')) return '#8a9aaa';
  if (fc.includes('mostly clear') || fc.includes('clear')) return '#1a3a5a';
  if (fc.includes('partly')) return '#6a8aaa';
  if (fc.includes('sunny') || fc.includes('mostly sunny')) return '#5aaad0';
  return '#4a7a9a';
}

function buildHourlyHTML(data) {
  let hourly = '';
  let crossedMidnight = false;

  for (let i = 0; i < data.hours.length; i++) {
    const hour = data.hours[i];
    const temp = data.temps[i];
    const feelsLike = data.feelsLike[i];
    const forecast = data.forecasts[i] || '';
    const windSpeed = data.winds[i];
    const gust = data.gusts[i];
    const precip = data.precip[i];
    const precipIn = (precip * 0.0394).toFixed(2);

    const timeStr = getTimeString(hour);
    const outfit = getOutfit(feelsLike, forecast, gust);
    const bgColor = getForecastColor(forecast);

    if (hour === 0 && !crossedMidnight && i > 0) {
      crossedMidnight = true;
      hourly += '<div style="text-align:center; padding: 10px; font-weight:bold;">Tomorrow</div>';
    }

    hourly += `
      <div style="background-color: ${bgColor}; padding: 15px; display: flex; align-items: center;">
        <div style="width: 30%; font-size: 12px;">${outfit}</div>
        <div style="width: 70%; text-align: center;">
          <div style="font-weight: bold; font-size: 16px;">${timeStr}</div>
          <div>Feels like ${feelsLike}\u00B0F | ${temp}\u00B0F</div>
          <div>${forecast}</div>
          <div>Wind: ${windSpeed} mph${gust ? ', Gusts: ' + gust + ' mph' : ''}</div>
        </div>
      </div>`;
  }

  return hourly;
}

// The center that calls all other functions
// Receiver that waits to hear from weather-data from main.js
ipcRenderer.on('weather-data', (event, data) => {
  const hourly = buildHourlyHTML(data);
  const content = '<b>Today</b><br>' + hourly + '<br>';
  const el = document.getElementById('hourly');
  el.innerHTML = content + content + content;
  el.scrollTop = el.scrollHeight / 3;

  let isDragging = false;
  let startY = 0;
  let scrollTop = 0;
  let velocity = 0;
  let lastY = 0;
  let animationFrame;

  function applyMomentum() {
    if (Math.abs(velocity) > 0.5) {
      el.scrollTop += velocity;
      velocity *= 0.95; // friction

      const oneThird = el.scrollHeight / 3;
      if (el.scrollTop >= oneThird * 2) {
        el.scrollTop -= oneThird;
        scrollTop = el.scrollTop;
      }
      if (el.scrollTop < oneThird) {
        el.scrollTop += oneThird;
        scrollTop = el.scrollTop;
      }

      animationFrame = requestAnimationFrame(applyMomentum);
    }
  }

  el.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    lastY = e.clientY;
    scrollTop = el.scrollTop;
    velocity = 0;
    el.style.cursor = 'grabbing';
    cancelAnimationFrame(animationFrame);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = startY - e.clientY;
    velocity = lastY - e.clientY;
    lastY = e.clientY;
    el.scrollTop = scrollTop + delta;

    const oneThird = el.scrollHeight / 3;
    if (el.scrollTop >= oneThird * 2) {
      el.scrollTop -= oneThird;
      scrollTop = el.scrollTop;
      startY = e.clientY;
    }
    if (el.scrollTop < oneThird) {
      el.scrollTop += oneThird;
      scrollTop = el.scrollTop;
      startY = e.clientY;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    el.style.cursor = 'grab';
    requestAnimationFrame(applyMomentum);
  });
});