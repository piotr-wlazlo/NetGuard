import json

from time import monotonic


def publish_packet(client, stream_name, packet):
    return client.xadd(
        stream_name,
        {
            "type": "packet",
            "data": json.dumps(packet, allow_nan=False)
        }
    )


def publish_import_finished(client, stream_name, packet_count):
    return client.xadd(
        stream_name,
        {
            "type": "import_finished",
            "packet_count": packet_count
        }
    )


def read_packets(client, stream_name, wait_timeout=30):
    if wait_timeout <= 0:
        raise ValueError("Wait timeout must be greater than zero.")

    last_id = "0-0"
    received_count = 0

    if not client.exists(stream_name):
        raise ValueError(f"Stream {stream_name} does not exist.")

    last_message_time = monotonic()

    while True:
        remaining_time = wait_timeout - (
            monotonic() - last_message_time
        )

        if remaining_time <= 0:
            raise TimeoutError(f"No messages received for {wait_timeout} seconds. Import did not finish: {stream_name}.")

        block_time = max(1, min(1000, int(remaining_time * 1000)))

        streams = client.xread(
            streams={stream_name: last_id},
            count=100,
            block=block_time
        )

        for _, messages in streams:
            for message_id, fields in messages:
                last_message_time = monotonic()
                message_type = fields.get("type")

                if message_type == "packet":
                    packet = json.loads(fields["data"])
                    received_count += 1
                    yield packet
                    last_message_time = monotonic()

                elif message_type == "import_finished":
                    expected_count = int(fields["packet_count"])

                    if received_count != expected_count:
                        raise ValueError(f"Packet count mismatch: received {received_count}, expected {expected_count}.")

                    return

                else:
                    raise ValueError(f"Unknown message type: {message_type}.")

                last_id = message_id