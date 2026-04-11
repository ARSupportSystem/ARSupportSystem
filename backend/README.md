# FastAPI Project

This is a FastAPI project structured for development. Below are the details for setting up and running the application.

## Project Structure

```
backend
├── app
│   ├── __init__.py
│   ├── main.py
│   ├── api
│   │   ├── __init__.py
│   │   └── routes.py
│   ├── core
│   │   ├── __init__.py
│   │   └── config.py
│   ├── models
│   │   └── __init__.py
│   ├── schemas
│   │   └── __init__.py
│   └── services
│       └── __init__.py
├── tests
│   └── __init__.py
├── requirements.txt
├── pyproject.toml
└── README.md
```

## Setup Instructions

1. **Clone the repository**:
   ```
   git clone <repository-url>
   cd backend
   ```

2. **Create a virtual environment**:
   ```
   python -m venv venv
   ```

3. **Activate the virtual environment**:
   - On Windows:
     ```
     venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```
     source venv/bin/activate
     ```

4. **Install dependencies**:
   ```
   pip install -r requirements.txt
   ```

## Running the Application

To start the FastAPI application, run the following command:

```
uvicorn app.main:app --reload
```

Visit `http://127.0.0.1:8000/docs` to access the interactive API documentation.

## Testing

To run the tests, use the following command:

```
pytest
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.