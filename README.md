# WeatherWise AI

WeatherWise AI is a full-stack weather information and decision-support application. The repository contains a React + Vite frontend and a Python Flask backend backed by SQLite. Weather and location data are retrieved through the Open-Meteo services.

## Features

The application includes the following areas:

- Current weather and forecast views
- Location search
- Air-quality information
- Weather comparison for multiple cities
- Weather decision assistant
- Rain arrival and duration estimates
- Clothing and comfort recommendations
- Weather-aware travel planning
- Weather alerts
- Forecast accuracy tracking
- Community weather reports
- User authentication, preferences and saved locations

> Forecasts, rain estimates, travel analysis and recommendations are informational tools. They should not be treated as guarantees or as a substitute for official emergency or severe-weather guidance.

## Technology stack

### Frontend

- React 19
- Vite
- React Router
- Tailwind CSS
- Axios
- Leaflet / React Leaflet
- Recharts
- Lucide React

### Backend

- Python
- Flask
- Flask-CORS
- SQLite
- Requests
- Gunicorn (deployment)

### External data

- Open-Meteo weather and geocoding services

## Repository structure

```text
WeatherWIse_AI-main/
├── backend/
│   ├── app.py                 # Flask application entry point
│   ├── config.py              # Backend configuration
│   ├── requirements.txt       # Python dependencies
│   ├── API_DOCS.md            # API endpoint documentation
│   ├── database/              # SQLite connection and schema
│   ├── routes/                # Flask API routes
│   ├── services/              # Weather and application services
│   ├── tests/                 # Backend tests
│   └── utils/                 # Shared response utilities
├── frontend/
│   ├── package.json           # Frontend dependencies and scripts
│   ├── vite.config.js         # Vite configuration and local API proxy
│   ├── src/
│   │   ├── components/        # Shared UI components
│   │   ├── context/           # React context, including authentication
│   │   ├── pages/             # Application pages
│   │   └── services/          # API client
│   └── public/                # Static assets
├── DEPLOYMENT.md              # Hosting instructions
└── README.md
```

## Requirements

Install the following before starting:

- Python 3.10 or newer (Python 3.12 is suitable)
- Node.js compatible with the Vite version in `frontend/package.json` (use a current Node.js LTS release)
- npm (included with Node.js)
- Git (optional, if cloning the repository)

## Run locally

Run the backend and frontend in two separate terminal windows. Commands below assume that the terminal is opened at the repository root.

### 1. Get the project

Extract the downloaded ZIP file, or clone the repository if you have access to it:

```bash
git clone <repository-url>
cd WeatherWIse_AI-main
```

If you downloaded the ZIP, simply open the extracted `WeatherWIse_AI-main` directory in VS Code.

### 2. Set up and start the backend

In Terminal 1:

```bash
cd backend
python3 -m venv venv
```

Activate the virtual environment on macOS or Linux:

```bash
source venv/bin/activate
```

On Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the Python packages:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Start Flask:

```bash
python app.py
```

The backend is configured to listen at:

```text
http://127.0.0.1:5000
```

Check the backend health endpoint in your browser:

```text
http://127.0.0.1:5000/api/health
```

A healthy response should report `"status": "ok"` and `"database": "connected"`.

### 3. Set up and start the frontend

Keep the backend terminal running. Open Terminal 2 at the repository root, then run:

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local development URL in the terminal. It is usually:

```text
http://localhost:5173
```

Open the URL printed by Vite in your browser.

### 4. Stop the servers

In each terminal, press `Ctrl + C` to stop its server. To work on the project again, activate the backend virtual environment and start both servers using the commands above.

## Environment configuration

The project includes example environment files:

- `backend/.env.example`
- `frontend/.env.example`

For local development, the frontend's Vite configuration proxies `/api` requests to `http://127.0.0.1:5000`, so `VITE_API_BASE_URL` can normally be left unset. The frontend API client uses that proxy when no base URL is supplied.

The backend reads configuration from environment variables. Relevant settings include:

| Variable | Purpose | Default / local guidance |
|---|---|---|
| `FLASK_DEBUG` | Enables Flask debug mode | Defaults to `true` in `backend/config.py` |
| `SECRET_KEY` | Secret used by Flask security/authentication features | Development fallback exists; set a strong secret outside local development |
| `CORS_ORIGINS` | Allowed frontend origins | Defaults to `*`; restrict this in production |
| `DATABASE_PATH` | SQLite database file location | Defaults to `backend/weatherwise.db` |
| `VITE_API_BASE_URL` | Backend base URL for the frontend | Leave unset for local Vite proxy; set to deployed backend URL in production |

Do not commit real secrets or production credentials to source control. The `.env.example` files are templates; copy and configure them only if you need custom environment values.

## API documentation

The backend API reference is in [`backend/API_DOCS.md`](backend/API_DOCS.md). The health endpoint is `GET /api/health`.

## Tests and quality checks

Backend tests are located in `backend/tests/`. From the `backend` directory, with the virtual environment activated, run:

```bash
python -m unittest discover -s tests
```

Frontend scripts are defined in `frontend/package.json`. From the `frontend` directory:

```bash
npm run lint
npm run build
```

The build output is generated in `frontend/dist/`.

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the repository's deployment guidance. It describes deploying the Flask backend to Render or Railway and the Vite frontend to Vercel or Netlify.

For production deployments, configure a strong `SECRET_KEY`, set `FLASK_DEBUG=false`, restrict `CORS_ORIGINS` to the deployed frontend domain, and use persistent storage for the SQLite database if the hosting platform's filesystem is ephemeral.

## Troubleshooting

### `python3` is not found

Check whether Python is installed and available on your PATH:

```bash
python3 --version
```

On some Windows installations, use `py --version` and replace `python3` with `py` in the setup commands.

### Virtual environment activation fails

Make sure the virtual environment was created from inside `backend/`. On macOS/Linux, activate it with `source venv/bin/activate`. On Windows PowerShell, use `venv\Scripts\Activate.ps1`.

### `pip install` fails

Confirm the virtual environment is activated, then try:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Frontend cannot reach the backend

Make sure Flask is running on port `5000` and that you started Vite using `npm run dev` from `frontend/`. The Vite development proxy forwards `/api` requests to `http://127.0.0.1:5000`.

### Port is already in use

Stop the other process using the port, or identify and close the existing server terminal before starting another instance.

## License

No license file was present in the supplied project archive. Add a `LICENSE` file if you intend to distribute or reuse this project under a specific open-source license.
