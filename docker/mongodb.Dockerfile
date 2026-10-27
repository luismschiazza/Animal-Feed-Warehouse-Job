# LOCAL development/test runtime, not a production topology or backup-tools image.
FROM mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907 AS prepared
USER root
# Backup/import tools and root-switch/init helpers are unnecessary for this runtime.
# mongod/mongosh, authentication, keyfiles, TLS and replica-set support remain intact.
RUN apt-get update \
    && apt-get install -y --no-install-recommends --only-upgrade zlib1g=1:1.3.dfsg-3.1ubuntu2.3 \
    && apt-get purge -y mongodb-database-tools \
    && rm -rf /var/lib/apt/lists/* /opt/js-yaml /js-yaml.js \
    && rm -f /usr/local/bin/gosu /usr/local/bin/docker-entrypoint.sh
COPY --chmod=755 docker/mongodb-local-entrypoint.sh /usr/local/bin/mongodb-local-entrypoint.sh
# A clean final filesystem prevents removed tools surviving in distributed lower layers.
# Keep the SAME Ubuntu/runtime libraries and mongod/mongosh from the pinned source.
FROM scratch
COPY --from=prepared / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER mongodb
EXPOSE 27017
VOLUME ["/data/db", "/data/configdb"]
ENTRYPOINT ["/usr/local/bin/mongodb-local-entrypoint.sh"]
CMD ["mongod", "--bind_ip_all"]
