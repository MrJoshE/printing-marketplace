package json

import (
	"encoding/json"
	"net/http"
)

func Write(w http.ResponseWriter, status int, data any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(data); err != nil {
		return err
	}
	return nil
}

func Read(r *http.Request, v any) error {
	decoder := json.NewDecoder(r.Body)
	return decoder.Decode(v)
}
