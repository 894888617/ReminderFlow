FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /server ./cmd/server


FROM alpine:3.20

WORKDIR /app

COPY --from=builder /server /app/server
COPY --from=builder /src/migrations /app/migrations

RUN chmod +x /app/server

EXPOSE 8080

CMD ["/app/server"]