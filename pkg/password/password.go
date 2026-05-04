package password

import "golang.org/x/crypto/bcrypt"

func Hash(raw string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(raw), bcrypt.DefaultCost)
	return string(bytes), err
}

func Check(raw, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(raw))
	return err == nil
}
