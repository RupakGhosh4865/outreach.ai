pipeline {
    agent any

    environment {
        // Secret file credential containing the filled-in .env (see .env.example)
        DOTENV = credentials('my-env-file')
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        stage('Setup') {
            steps {
                // Remove first in case a previous run left a root-owned file.
                sh 'rm -f .env'
                sh 'cp $DOTENV .env'
            }
        }

        stage('Test') {
            parallel {
                stage('Server tests') {
                    steps {
                        dir('server') {
                            sh 'npm ci'
                            // FSM, email composition, mailer, PDF extraction,
                            // auth middleware, cron claim.
                            sh 'npm test'
                        }
                    }
                }
                stage('Client lint & build') {
                    steps {
                        dir('client') {
                            sh 'npm ci'
                            sh 'npm run lint'
                            // The build is the real gate — lint errors fail it.
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        stage('Build images') {
            steps {
                sh 'docker compose -f docker-compose.prod.yml build'
            }
        }

        stage('Deploy') {
            steps {
                sh 'docker compose -f docker-compose.prod.yml down || true'
                sh 'docker compose -f docker-compose.prod.yml up -d'
                // Fail the build if the API never becomes healthy, rather than
                // reporting a green deploy for a container that is crash-looping.
                sh '''
                    for i in $(seq 1 30); do
                        if curl -fsS http://localhost:5000/api/health > /dev/null; then
                            echo "Server healthy"; exit 0
                        fi
                        sleep 5
                    done
                    echo "Server did not become healthy within 150s"
                    docker compose -f docker-compose.prod.yml logs --tail=100 server
                    exit 1
                '''
            }
        }
    }

    post {
        failure {
            sh 'docker compose -f docker-compose.prod.yml logs --tail=200 || true'
        }
        always {
            cleanWs()
        }
    }
}
