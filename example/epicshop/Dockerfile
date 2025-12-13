FROM node:24-bookworm-slim as base

RUN apt-get update && apt-get install -y git

# Build argument for GitHub repo URL
ARG EPICSHOP_GITHUB_REPO
ENV EPICSHOP_GITHUB_REPO=${EPICSHOP_GITHUB_REPO}

ENV EPICSHOP_CONTEXT_CWD="/myapp/workshop-content"
ENV EPICSHOP_HOME_DIR="/myapp/.epicshop"
ENV EPICSHOP_DEPLOYED="true"
ENV EPICSHOP_DISABLE_WATCHER="true"
ENV FLY="true"
ENV PORT="8080"
ENV NODE_ENV="production"

# Build argument for commit SHA to bust cache when repo changes
ARG EPICSHOP_COMMIT_SHA
ENV EPICSHOP_COMMIT_SHA=${EPICSHOP_COMMIT_SHA}

WORKDIR /myapp

# Clone the workshop repo during build time, excluding database files
# Clone specific commit to keep image small while ensuring cache busting
RUN git init ${EPICSHOP_CONTEXT_CWD} && \
    cd ${EPICSHOP_CONTEXT_CWD} && \
    git remote add origin ${EPICSHOP_GITHUB_REPO} && \
    git fetch --depth 1 origin ${EPICSHOP_COMMIT_SHA} && \
    git checkout ${EPICSHOP_COMMIT_SHA}

ADD . .

RUN npm install --omit=dev

RUN cd ${EPICSHOP_CONTEXT_CWD} && \
    npx epicshop warm

CMD cd ${EPICSHOP_CONTEXT_CWD} && \
    npx epicshop start
