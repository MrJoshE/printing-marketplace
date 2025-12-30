package events

type Bus interface {
	Publish(subject string, data []byte, msgId string) error
	Drain() error
}
