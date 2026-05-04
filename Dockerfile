FROM golang:1.25.1 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o server ./cmd/server


FROM alpine:3.20

WORKDIR /app

COPY --from=builder /app/server /app/server
COPY --from=builder /app/migrations /app/migrations

EXPOSE 8080

CMD ["/app/server"]