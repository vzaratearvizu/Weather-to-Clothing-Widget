const { app, BrowserWindow } = require('electron');
const https = require('https');
const cheerio = require('cheerio');

let wind;

function createWindow() {
  wind = new BrowserWindow({
    width: 350,
    height: 700,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  wind.loadFile('index.html');
}

// Scrapes hours, temps, winds, gusts from NWS digital forecast table
function scrapeNWSTable(callback) {
  const options = {
    hostname: 'forecast.weather.gov',
    path: '/MapClick.php?CityName=Boston&state=MA&site=BOX&textField1=42.3583&textField2=-71.0603&FcstType=digital',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  https.get(options, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
      const $ = cheerio.load(html);
      let hours = [], temps = [], winds = [], gusts = [];

      $('tr').each((i, row) => {
        const firstCell = $(row).find('td').first().text().trim();
        const values = [];
        $(row).find('td').each((j, cell) => {
          const val = $(cell).text().trim();
          if (j > 0 && val !== '' && !isNaN(val)) values.push(parseInt(val));
        });
        if (firstCell.includes('Hour') && values.length > 0 && hours.length === 0) hours = values;
        if (firstCell.includes('Temp') && values.length > 0 && temps.length === 0) temps = values;
        if (firstCell.includes('Wind') && firstCell.includes('Surface') && values.length > 0 && winds.length === 0) winds = values;
        if (firstCell.includes('Gust') && values.length > 0 && gusts.length === 0) gusts = values;
      });

      callback({ hours, temps, winds, gusts });
    });
  }).on('error', err => console.log('Scrape Error:', err.message));
}

// Fetches shortForecast per hour from NWS hourly API
function fetchForecasts(hours, callback) {
  https.get({
    hostname: 'api.weather.gov',
    path: '/gridpoints/BOX/71,90/forecast/hourly',
    headers: { 'User-Agent': 'weather-widget' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const json = JSON.parse(data);
      const periods = json.properties.periods;
      const forecasts = periods.slice(0, hours.length).map(p => p.shortForecast);
      callback(periods, forecasts);
    });
  }).on('error', err => console.log('Forecast Error:', err.message));
}

// Fetches feels like and precipitation from NWS gridpoints
function fetchGridData(periods, hours, callback) {
  https.get({
    hostname: 'api.weather.gov',
    path: '/gridpoints/BOX/71,90',
    headers: { 'User-Agent': 'weather-widget' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const json = JSON.parse(data);
      const apparentTemps = json.properties.apparentTemperature.values;
      const precipData = json.properties.quantitativePrecipitation.values;

      const feelsLike = hours.map((hour, i) => {
        const periodTime = new Date(periods[i].startTime).getTime();
        const match = apparentTemps.find(a => {
          const start = new Date(a.validTime.split('/')[0]).getTime();
          const durationHours = parseInt(a.validTime.split('PT')[1].replace('H', ''));
          const end = start + (durationHours * 60 * 60 * 1000);
          return periodTime >= start && periodTime < end;
        });
        return match ? Math.round((match.value * 9 / 5) + 32) : null;
      });

      const precip = hours.map((hour, i) => {
        const periodTime = new Date(periods[i].startTime).getTime();
        const match = precipData.find(a => {
          const start = new Date(a.validTime.split('/')[0]).getTime();
          const durationHours = parseInt(a.validTime.split('PT')[1].replace('H', ''));
          const end = start + (durationHours * 60 * 60 * 1000);
          return periodTime >= start && periodTime < end;
        });
        return match ? Math.round(match.value * 10) / 10 : 0;
      });

      callback({ feelsLike, precip });
    });
  }).on('error', err => console.log('Grid Error:', err.message));
}

// Orchestrates all fetches and sends data to renderer
function fetchWeather() {
  scrapeNWSTable(({ hours, temps, winds, gusts }) => {
    fetchForecasts(hours, (periods, forecasts) => {
      fetchGridData(periods, hours, ({ feelsLike, precip }) => {
        wind.webContents.send('weather-data', { hours, temps, winds, gusts, forecasts, feelsLike, precip });
      });
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  fetchWeather();
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: [app.getAppPath()]
  });
});
app.on('window-all-closed', () => app.quit());