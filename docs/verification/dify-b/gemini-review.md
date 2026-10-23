# Auxiliary SSE parser review via 9Router

Requested model: ag/gemini-3.8-flash-high
Returned model: gemini-3.8-flash-n

**No.** While fragmented UTF-8 is handled properly via `TextDecoder({stream: !done})`, stream termination is not robust:

1. **Hangs on completion**: Receiving `event === 'done'` sets `complete = true` but does not `break`. If the server keeps the HTTP connection open, the parser hangs indefinitely on `await reader.read()`.
2. **Drops trailing frame on stream end**: Frames are only parsed when followed by `\r?\n\r?\n`. If the stream closes without trailing newlines, the final frame remaining in `buffer` is never processed, falsely throwing `"Stream incomplete"`. 

*(Also, standard SSE frames omitting `event:` are dropped instead of defaulting to `"message"`).*