# Railway-ready Evolution API wrapper.
# Railway should use `evolution` as the service root directory.
#
# The upstream image already contains the application, entrypoint, and CMD.
# This wrapper exists so the repo can be deployed directly from GitHub while
# keeping the official Evolution API runtime.
FROM evoapicloud/evolution-api:latest

ENV NODE_ENV=production
ENV DOCKER_ENV=true

COPY railway-entrypoint.sh /usr/local/bin/talktostellar-evolution-entrypoint
RUN chmod +x /usr/local/bin/talktostellar-evolution-entrypoint

# Railway injects PORT at runtime. Set SERVER_PORT=${{PORT}} in Railway
# variables so Evolution listens on Railway's assigned port.
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/talktostellar-evolution-entrypoint"]
