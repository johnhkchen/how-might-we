client<llm> Claude {
  provider anthropic
  options {
    model "claude-sonnet-4-6"
    api_key env.ANTHROPIC_API_KEY
    max_tokens 4096
  }
}

retry_policy Default {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 500
    multiplier 2
    max_delay_ms 10000
  }
}
