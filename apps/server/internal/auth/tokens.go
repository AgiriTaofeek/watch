package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// NewToken generates a cryptographically random hex string from the given
// number of bytes. 32 bytes → 64 hex chars → 256 bits of entropy.
func NewToken(byteLen int) (string, error) {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}
