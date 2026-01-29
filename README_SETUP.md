# Setup Instructions

## Database Setup

1. **Install MySQL** (if not already installed)
   - macOS: `brew install mysql`
   - Or download from https://dev.mysql.com/downloads/mysql/

2. **Start MySQL service**
   ```bash
   # macOS
   brew services start mysql
   
   # Or start manually
   mysql.server start
   ```

3. **Create the database**
   ```bash
   mysql -u root -p
   ```
   Then in MySQL:
   ```sql
   CREATE DATABASE cash_drop_db;
   EXIT;
   ```

4. **Configure environment variables**
   Create a `.env` file in `server_nodejs/` directory:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=cash_drop_db
   JWT_SECRET=cbjdVCQVE;OCLQ CBMASBCVICVQOFQefkbkjwebv;w
   PORT=8000
   ```

5. **Install dependencies**
   ```bash
   cd server_nodejs
   npm install
   ```

6. **Start the server**
   ```bash
   npm run dev
   # or
   npm start
   ```

## Troubleshooting

### Error: ENOENT: no such file or directory, uv_cwd
This error occurs when Node.js can't access the current working directory. To fix:

1. **Close all terminal windows** and open a new one
2. **Navigate to the correct directory**:
   ```bash
   cd /Users/dskreddy/cash-drop-app/cash-drop-app/server_nodejs
   ```
3. **Verify you're in the right place**:
   ```bash
   pwd
   ls -la
   ```
4. **Start the server again**:
   ```bash
   npm run dev
   ```

### MySQL Connection Errors
- Ensure MySQL is running: `brew services list` (macOS) or `systemctl status mysql` (Linux)
- Verify database exists: `mysql -u root -p -e "SHOW DATABASES;"`
- Check credentials in `.env` file match your MySQL setup

### First Time Setup
When you first run the application with zero users:
1. The app will automatically redirect to `/register`
2. Create the first admin user (no login required)
3. After registration, you can log in with that user
