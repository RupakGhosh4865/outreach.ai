pipeline {
    agent any
    
    environment {
        // "my-env-file" is the ID you will create in Jenkins
        DOTENV = credentials('my-env-file') 
    }

    stages {
        stage('Setup') {
            steps {
                script {
                    // Try to remove existing .env first (fixes permission issues if owned by root)
                    sh 'rm -f .env'
                    // Copy the secret file content to .env in the workspace
                    // This ensures docker-compose can find it
                    sh 'cp $DOTENV .env'
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    // Build images using docker-compose
                    sh 'docker-compose build'
                }
            }
        }

        stage('Test') {
            steps {
                // Example: Run linting for client
                dir('client') {
                    sh 'npm install'
                    sh 'npm run lint'
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    // Stop any existing containers to free up ports
                    // '|| true' ensures the build doesn't fail if no containers are running
                    sh 'docker-compose down || true'
                    
                    // Run the containers in detached mode
                    sh 'docker-compose up -d'
                }
            }
        }
    }
    
    post {
        always {
            // Clean up the workspace after the build
            cleanWs()
        }
    }
}
