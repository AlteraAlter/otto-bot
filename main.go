package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type config struct {
	Port               string
	ServiceBearerToken string
	AllowedClientID    string
	AllowedClientKey   string
	OttoBaseURL        string
	OttoAPIToken       string
	OttoClientID       string
	OttoClientKey      string
}

func loadConfig() config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	return config{
		Port:               port,
		ServiceBearerToken: os.Getenv("SERVICE_BEARER_TOKEN"),
		AllowedClientID:    os.Getenv("ALLOWED_CLIENT_ID"),
		AllowedClientKey:   os.Getenv("ALLOWED_CLIENT_KEY"),
		OttoBaseURL:        strings.TrimRight(os.Getenv("OTTO_BASE_URL"), "/"),
		OttoAPIToken:       os.Getenv("OTTO_API_TOKEN"),
		OttoClientID:       os.Getenv("OTTO_CLIENT_ID"),
		OttoClientKey:      os.Getenv("OTTO_CLIENT_KEY"),
	}
}

func main() {
	cfg := loadConfig()
	client := &http.Client{Timeout: 20 * time.Second}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/v1/otto/data", auth(cfg, uploadHandler(cfg, client)))
	mux.HandleFunc("/v1/otto/data/", auth(cfg, retrieveHandler(cfg, client)))

	addr := ":" + cfg.Port
	log.Printf("Otto service template listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"service": "otto-data-service-template",
	})
}

func auth(cfg config, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := bearerToken(r.Header.Get("Authorization"))
		if err != nil ||
			token != cfg.ServiceBearerToken ||
			r.Header.Get("x-client-id") != cfg.AllowedClientID ||
			r.Header.Get("x-client-key") != cfg.AllowedClientKey {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error":   "Unauthorized",
				"details": "Invalid token or client credentials.",
			})
			return
		}
		next(w, r)
	}
}

func uploadHandler(cfg config, client *http.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
			return
		}

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil || len(bytes.TrimSpace(bodyBytes)) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Request body is required."})
			return
		}

		req, err := http.NewRequest(http.MethodPost, cfg.OttoBaseURL+"/v1/data", bytes.NewReader(bodyBytes))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build Otto request"})
			return
		}
		setOttoHeaders(req, cfg)

		resp, err := client.Do(req)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error":   "Otto upload failed",
				"details": err.Error(),
			})
			return
		}
		defer resp.Body.Close()

		proxyOttoResponse(w, resp, "Data uploaded to Otto")
	}
}

func retrieveHandler(cfg config, client *http.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
			return
		}

		id := strings.TrimPrefix(r.URL.Path, "/v1/otto/data/")
		if id == "" || strings.Contains(id, "/") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID path parameter"})
			return
		}

		req, err := http.NewRequest(http.MethodGet, cfg.OttoBaseURL+"/v1/data/"+id, nil)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to build Otto request"})
			return
		}
		setOttoHeaders(req, cfg)

		resp, err := client.Do(req)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{
				"error":   "Otto retrieve failed",
				"details": err.Error(),
			})
			return
		}
		defer resp.Body.Close()

		proxyOttoResponse(w, resp, "Data retrieved from Otto")
	}
}

func setOttoHeaders(req *http.Request, cfg config) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.OttoAPIToken)
	req.Header.Set("x-client-id", cfg.OttoClientID)
	req.Header.Set("x-client-key", cfg.OttoClientKey)
}

func proxyOttoResponse(w http.ResponseWriter, resp *http.Response, successMessage string) {
	raw, _ := io.ReadAll(resp.Body)
	var parsed any
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &parsed); err != nil {
			parsed = map[string]string{"raw": string(raw)}
		}
	} else {
		parsed = map[string]any{}
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		writeJSON(w, resp.StatusCode, map[string]any{
			"error":        "Otto request failed",
			"ottoStatus":   resp.StatusCode,
			"ottoResponse": parsed,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":      successMessage,
		"ottoResponse": parsed,
	})
}

func bearerToken(authHeader string) (string, error) {
	const prefix = "Bearer "
	if !strings.HasPrefix(authHeader, prefix) {
		return "", errors.New("missing bearer token")
	}
	token := strings.TrimSpace(strings.TrimPrefix(authHeader, prefix))
	if token == "" {
		return "", errors.New("empty bearer token")
	}
	return token, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
