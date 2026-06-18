# Matchstick test runner (spec 017). graph-cli 0.80's `graph test` binary fetcher
# rejects newer host platforms (e.g. Ubuntu 24.04 → "Unsupported platform: Linux
# x64 24"), and `graph test -d` requires an interactive TTY that CI runners lack.
# This is the image `graph test -d` generates, vendored so CI can build it and
# run it non-interactively. The project is bind-mounted at /matchstick at run time
# (so generated/ from `graph codegen` must exist before running the container).
FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
ENV ARGS=""

RUN apt update \
  && apt install -y sudo curl postgresql postgresql-contrib

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - \
  && sudo apt-get install -y nodejs

RUN curl -OL https://github.com/LimeChain/matchstick/releases/download/0.6.0/binary-linux-22 \
  && chmod a+x binary-linux-22

RUN mkdir matchstick
WORKDIR /matchstick

CMD ["/bin/sh", "-c", "../binary-linux-22 ${ARGS}"]
