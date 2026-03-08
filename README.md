# My Fullstack App

A full-stack application with a Next.js client and Node.js/Express server, containerized with Docker.

## Project Structure
- **client**: Next.js frontend
- **server**: Node.js/Express backend
- **docker-compose.yml**: Orchestration for local development

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js (for local development without Docker)

### Running Locally
```bash
docker-compose up
```
The client will be available at `http://localhost:3000` and the server at `http://localhost:5000`.

---

## Jenkins CI/CD Setup

This project includes a `Jenkinsfile` for a declarative CI/CD pipeline.

### Prerequisites for Jenkins Server
1.  **Jenkins** installed and running.
2.  **Docker** installed on the Jenkins agent/server.
    *   **Why?** The pipeline uses `docker-compose` to build the application.
    *   **Verify**: Run `docker --version` on the Jenkins server.
3.  **Git** installed on the Jenkins agent/server.

### Step 1: Create the Pipeline Job
1.  Open Jenkins Dashboard.
2.  Click **New Item**.
3.  Enter a name (e.g., `my-fullstack-app`) and select **Pipeline**.
4.  Click **OK**.

### Step 2: Configure SCM
1.  Scroll to the **Pipeline** section.
2.  Set **Definition** to **Pipeline script from SCM**.
3.  Set **SCM** to **Git**.
4.  **Repository URL**: `https://github.com/Rajneesh2223/devop-project.git`
5.  **Branch Specifier**: `*/main`
6.  **Script Path**: `Jenkinsfile`

### Step 3: Configure Secrets (.env)
The `.env` file is not tracked in git for security. You must inject it using Jenkins Credentials.

1.  Go to **Dashboard** > **Manage Jenkins** > **Credentials**.
2.  Add a new credential of kind **Secret file**.
3.  **Upload** your local `.env` file.
4.  **ID**: Set this EXACTLY to `my-env-file`.
    *   *The `Jenkinsfile` specifically looks for this ID.*
5.  Click **Create**.

### Step 4: Run Build
1.  Go to the job page.
2.  Click **Build Now**.

### Accessing the Application
The pipeline now includes a **Deploy** stage that runs `docker-compose up -d`.

**1. If Jenkins is on your Local Machine:**
- **Client**: `http://localhost:3000`
- **Server**: `http://localhost:5000`

**2. If Jenkins is on a Cloud Server (AWS, Azure, etc.):**
- **Client**: `http://<YOUR_SERVER_PUBLIC_IP>:3000`
- **Server**: `http://<YOUR_SERVER_PUBLIC_IP>:5000`

> **Important:** Ensure ports **3000** and **5000** are open in your firewall or Security Group (AWS/Azure) settings.

### Automating Builds (GitHub Webhook)

To trigger builds automatically on push, you need to connect GitHub to Jenkins.

#### ⚠️ Critical Warning for Localhost
If Jenkins is running on your laptop (`localhost`), **GitHub cannot see it**.
- **Solution**: Use **ngrok** to create a public URL (e.g., `https://random.ngrok.io`).
- **Cloud Servers**: If on AWS/Azure, just use your Public IP.

#### Step 1: Configure Jenkins
1.  Go to your Job > **Configure**.
2.  Under **Build Triggers**, check **"GitHub hook trigger for GITScm polling"**.
3.  Click **Save**.

#### Step 2: Configure GitHub
1.  Go to your Repo > **Settings** > **Webhooks**.
2.  Click **Add webhook**.
3.  **Payload URL**: `http://<YOUR_JENKINS_URL>:8080/github-webhook/`
    *   *Cloud Example*: `http://123.45.67.89:8080/github-webhook/`
    *   *Ngrok Example*: `https://random.ngrok.io/github-webhook/`
4.  **Content type**: `application/json`.
5.  **Events**: Select **"Just the push event"**.
6.  Click **Add webhook**.
