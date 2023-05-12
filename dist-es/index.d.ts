/// <reference types="node" resolution-mode="require"/>
/// <reference types="node" resolution-mode="require"/>
/// <reference types="node" resolution-mode="require"/>
declare module "amqp-error" {
    import { AMQPBaseClient } from "amqp-base-client";
    /**
     * An error, can be both AMQP level errors or socket errors
     * @property {string} message
     * @property {AMQPBaseClient} connection - The connection the error was raised on
     */
    export class AMQPError extends Error {
        connection: AMQPBaseClient;
        /**
         * @param message - Error description
         * @param connection - The connection the error was raised on
         */
        constructor(message: string, connection: AMQPBaseClient);
    }
}
declare module "amqp-properties" {
    export type AMQPProperties = {
        /** content type of body, eg. application/json */
        contentType?: string;
        /** content encoding of body, eg. gzip */
        contentEncoding?: string;
        /** custom headers, can also be used for routing with header exchanges */
        headers?: Record<string, Field>;
        /** 1 for transient messages, 2 for persistent messages */
        deliveryMode?: number;
        /** between 0 and 255 */
        priority?: number;
        /** for RPC requests */
        correlationId?: string;
        /** for RPC requests */
        replyTo?: string;
        /** Message TTL, in milliseconds, as string */
        expiration?: string;
        messageId?: string;
        /** the time the message was generated */
        timestamp?: Date;
        type?: string;
        userId?: string;
        appId?: string;
    };
    export type Field = string | boolean | bigint | number | undefined | null | object;
}
declare module "amqp-view" {
    import { AMQPProperties, Field } from "amqp-properties";
    /**
     * An extended DataView, with AMQP protocol specific methods.
     * Set methods returns bytes written.
     * Get methods returns the value read and how many bytes it used.
     * @ignore
     */
    export class AMQPView extends DataView {
        getUint64(byteOffset: number, littleEndian?: boolean): number;
        setUint64(byteOffset: number, value: number, littleEndian?: boolean): void;
        getInt64(byteOffset: number, littleEndian?: boolean): number;
        setInt64(byteOffset: number, value: number, littleEndian?: boolean): void;
        getShortString(byteOffset: number): [string, number];
        setShortString(byteOffset: number, string: string): number;
        getLongString(byteOffset: number, littleEndian?: boolean): [string, number];
        setLongString(byteOffset: number, string: string, littleEndian?: boolean): number;
        getProperties(byteOffset: number, littleEndian?: boolean): [AMQPProperties, number];
        setProperties(byteOffset: number, properties: AMQPProperties, littleEndian?: boolean): number;
        getTable(byteOffset: number, littleEndian?: boolean): [Record<string, Field>, number];
        setTable(byteOffset: number, table: Record<string, Field>, littleEndian?: boolean): number;
        getField(byteOffset: number, littleEndian?: boolean): [Field, number];
        setField(byteOffset: number, field: Field, littleEndian?: boolean): number;
        getArray(byteOffset: number, littleEndian?: boolean): [Field[], number];
        setArray(byteOffset: number, array: Field[], littleEndian?: boolean): number;
        getByteArray(byteOffset: number, littleEndian?: boolean): [Uint8Array, number];
        setByteArray(byteOffset: number, data: Uint8Array, littleEndian?: boolean): number;
    }
}
declare module "amqp-message" {
    import { AMQPChannel } from "amqp-channel";
    import { AMQPProperties } from "amqp-properties";
    /**
     * AMQP message
     * @property {AMQPChannel} channel - Channel this message was delivered on
     * @property {string} exchange - The exchange the message was published to
     * @property {string} routingKey - The routing key the message was published with
     * @property {object} properties - Message metadata
     * @property {number} bodySize - Byte size of the body
     * @property {Uint8Array} body - The raw message body
     * @property {number} deliveryTag - The deliveryTag of this message
     * @property {boolean} redelivered - The consumer tag, if deliveried to a consumer
     * @property {string?} consumerTag - The consumer tag, if deliveried to a consumer
     * @property {number?} messageCount - Number of messages left in queue (when polling)
     * @property {number} replyCode - Code if message was returned
     * @property {string} replyText - Error message on why message was returned
     */
    export class AMQPMessage {
        channel: AMQPChannel;
        exchange: string;
        routingKey: string;
        properties: AMQPProperties;
        bodySize: number;
        body: Uint8Array | null;
        bodyPos: number;
        deliveryTag: number;
        consumerTag: string;
        redelivered: boolean;
        messageCount?: number;
        replyCode?: number;
        replyText?: string;
        /**
         * @param channel - Channel this message was delivered on
         */
        constructor(channel: AMQPChannel);
        /**
         * Converts the message (which is deliviered as an uint8array) to a string
         */
        bodyToString(): string | null;
        bodyString(): string | null;
        /** Acknowledge the message */
        ack(multiple?: boolean): Promise<void>;
        /** Negative acknowledgment (same as reject) */
        nack(requeue?: boolean, multiple?: boolean): Promise<void>;
        /** Rejected the message */
        reject(requeue?: boolean): Promise<void>;
        /** Cancel the consumer the message arrived to **/
        cancelConsumer(): Promise<AMQPChannel>;
    }
}
declare module "amqp-consumer" {
    import { AMQPChannel } from "amqp-channel";
    import { AMQPMessage } from "amqp-message";
    /**
     * A consumer, subscribed to a queue
     */
    export class AMQPConsumer {
        readonly channel: AMQPChannel;
        readonly tag: string;
        readonly onMessage: (msg: AMQPMessage) => void;
        private closed;
        private closedError?;
        private resolveWait?;
        private rejectWait?;
        private timeoutId?;
        /**
         * @param channel - the consumer is created on
         * @param tag - consumer tag
         * @param onMessage - callback executed when a message arrive
         */
        constructor(channel: AMQPChannel, tag: string, onMessage: (msg: AMQPMessage) => void);
        /**
         * Wait for the consumer to finish.
         * @param [timeout] wait for this many milliseconds and then return regardless
         * @return Fulfilled when the consumer/channel/connection is closed by the client. Rejected if the timeout is hit.
         */
        wait(timeout?: number): Promise<void>;
        /**
         * Cancel/abort/stop the consumer. No more messages will be deliviered to the consumer.
         * Note that any unacked messages are still unacked as they belong to the channel and not the consumer.
         */
        cancel(): Promise<AMQPChannel>;
        /**
         * @ignore
         * @param [err] - why the consumer was closed
         */
        setClosed(err?: Error): void;
    }
}
declare module "amqp-queue" {
    import { AMQPMessage } from "amqp-message";
    import { AMQPChannel, ConsumeParams } from "amqp-channel";
    import { AMQPProperties } from "amqp-properties";
    import { AMQPConsumer } from "amqp-consumer";
    /**
     * Convience class for queues
     */
    export class AMQPQueue {
        readonly channel: AMQPChannel;
        readonly name: string;
        /**
         * @param channel - channel this queue was declared on
         * @param name - name of the queue
         */
        constructor(channel: AMQPChannel, name: string);
        /**
         * Bind the queue to an exchange
         */
        bind(exchange: string, routingKey?: string, args?: {}): Promise<AMQPQueue>;
        /**
         * Delete a binding between this queue and an exchange
         */
        unbind(exchange: string, routingKey?: string, args?: {}): Promise<AMQPQueue>;
        /**
         * Publish a message directly to the queue
         * @param body - the data to be published, can be a string or an uint8array
         * @param properties - publish properties
         * @return fulfilled when the message is enqueue on the socket, or if publish confirm is enabled when the message is confirmed by the server
         */
        publish(body: string | Uint8Array | ArrayBuffer | Buffer | null, properties?: AMQPProperties): Promise<AMQPQueue>;
        /**
         * Subscribe to the queue
         * @param params
         * @param [params.noAck=true] - if messages are removed from the server upon delivery, or have to be acknowledged
         * @param [params.exclusive=false] - if this can be the only consumer of the queue, will return an Error if there are other consumers to the queue already
         * @param [params.tag=""] - tag of the consumer, will be server generated if left empty
         * @param [params.args={}] - custom arguments
         * @param {function(AMQPMessage) : void} callback - Function to be called for each received message
         */
        subscribe({ noAck, exclusive, tag, args }: ConsumeParams, callback: (msg: AMQPMessage) => void): Promise<AMQPConsumer>;
        /**
         * Unsubscribe from the queue
         */
        unsubscribe(consumerTag: string): Promise<AMQPQueue>;
        /**
         * Delete the queue
         */
        delete(): Promise<AMQPQueue>;
        /**
         * Poll the queue for messages
         * @param params
         * @param params.noAck - automatically acknowledge messages when received
         */
        get({ noAck }?: {
            noAck?: boolean;
        }): Promise<AMQPMessage>;
        purge(): Promise<import("amqp-channel").MessageCount>;
    }
}
declare module "amqp-channel" {
    import { AMQPQueue } from "amqp-queue";
    import { AMQPConsumer } from "amqp-consumer";
    import { AMQPMessage } from "amqp-message";
    import { AMQPBaseClient } from "amqp-base-client";
    import { AMQPProperties } from "amqp-properties";
    /**
     * Represents an AMQP Channel. Almost all actions in AMQP are performed on a Channel.
     */
    export class AMQPChannel {
        readonly connection: AMQPBaseClient;
        readonly id: number;
        readonly consumers: Map<string, AMQPConsumer>;
        readonly promises: [(value?: any) => void, (err?: Error) => void][];
        private readonly unconfirmedPublishes;
        closed: boolean;
        confirmId: number;
        delivery?: AMQPMessage;
        getMessage?: AMQPMessage;
        returned?: AMQPMessage;
        onerror: (reason: string) => void;
        /**
         * @param connection - The connection this channel belongs to
         * @param id - ID of the channel
         */
        constructor(connection: AMQPBaseClient, id: number);
        /**
         * Declare a queue and return an AMQPQueue instance.
         */
        queue(name?: string, { passive, durable, autoDelete, exclusive }?: QueueParams, args?: {}): Promise<AMQPQueue>;
        /**
         * Alias for basicQos
         * @param prefetchCount - max inflight messages
         */
        prefetch(prefetchCount: number): Promise<void>;
        /**
         * Default handler for Returned messages
         * @param message returned from server
         */
        onReturn(message: AMQPMessage): void;
        /**
         * Close the channel gracefully
         * @param [reason] might be logged by the server
         */
        close(reason?: string, code?: number): Promise<void>;
        /**
         * Synchronously receive a message from a queue
         * @param queue - name of the queue to poll
         * @param param
         * @param [param.noAck=true] - if message is removed from the server upon delivery, or have to be acknowledged
         * @return - returns null if the queue is empty otherwise a single message
         */
        basicGet(queue: string, { noAck }?: {
            noAck?: boolean;
        }): Promise<AMQPMessage | null>;
        /**
         * Consume from a queue. Messages will be delivered asynchronously.
         * @param queue - name of the queue to poll
         * @param param
         * @param [param.tag=""] - tag of the consumer, will be server generated if left empty
         * @param [param.noAck=true] - if messages are removed from the server upon delivery, or have to be acknowledged
         * @param [param.exclusive=false] - if this can be the only consumer of the queue, will return an Error if there are other consumers to the queue already
         * @param [param.args={}] - custom arguments
         * @param {function(AMQPMessage) : void} callback - will be called for each message delivered to this consumer
         */
        basicConsume(queue: string, { tag, noAck, exclusive, args }: {
            tag?: string;
            noAck?: boolean;
            exclusive?: boolean;
            args?: {};
        }, callback: (msg: AMQPMessage) => void): Promise<AMQPConsumer>;
        /**
         * Cancel/stop a consumer
         * @param tag - consumer tag
         */
        basicCancel(tag: string): Promise<AMQPChannel>;
        /**
         * Acknowledge a delivered message
         * @param deliveryTag - tag of the message
         * @param [multiple=false] - batch confirm all messages up to this delivery tag
         */
        basicAck(deliveryTag: number, multiple?: boolean): Promise<void>;
        /**
         * Acknowledge a delivered message
         * @param deliveryTag - tag of the message
         * @param [requeue=false] - if the message should be requeued or removed
         * @param [multiple=false] - batch confirm all messages up to this delivery tag
         */
        basicNack(deliveryTag: number, requeue?: boolean, multiple?: boolean): Promise<void>;
        /**
         * Acknowledge a delivered message
         * @param deliveryTag - tag of the message
         * @param [requeue=false] - if the message should be requeued or removed
         */
        basicReject(deliveryTag: number, requeue?: boolean): Promise<void>;
        /**
         * Tell the server to redeliver all unacknowledged messages again, or reject and requeue them.
         * @param [requeue=false] - if the message should be requeued or redeliviered to this channel
         */
        basicRecover(requeue?: boolean): Promise<void>;
        /**
         * Publish a message
         * @param exchange - the exchange to publish to, the exchange must exists
         * @param routingKey - routing key
         * @param data - the data to be published, can be a string or an uint8array
         * @param properties - properties to be published
         * @param [mandatory] - if the message should be returned if there's no queue to be delivered to
         * @param [immediate] - if the message should be returned if it can't be delivered to a consumer immediately (not supported in RabbitMQ)
         * @return - fulfilled when the message is enqueue on the socket, or if publish confirm is enabled when the message is confirmed by the server
         */
        basicPublish(exchange: string, routingKey: string, data: string | Uint8Array | ArrayBuffer | Buffer | null, properties?: AMQPProperties, mandatory?: boolean, immediate?: boolean): Promise<number>;
        /**
         * Set prefetch limit.
         * Recommended to set as each unacknowledge message will be store in memory of the client.
         * The server won't deliver more messages than the limit until messages are acknowledged.
         * @param prefetchCount - number of messages to limit to
         * @param prefetchSize - number of bytes to limit to (not supported by RabbitMQ)
         * @param global - if the prefetch is limited to the channel, or if false to each consumer
         */
        basicQos(prefetchCount: number, prefetchSize?: number, global?: boolean): Promise<void>;
        /**
         * Enable or disable flow. Disabling flow will stop the server from delivering messages to consumers.
         * Not supported in RabbitMQ
         * @param active - false to stop the flow, true to accept messages
         */
        basicFlow(active?: boolean): Promise<boolean>;
        /**
         * Enable publish confirm. The server will then confirm each publish with an Ack or Nack when the message is enqueued.
         */
        confirmSelect(): Promise<void>;
        /**
         * Declare a queue
         * @param name - name of the queue, if empty the server will generate a name
         * @param params
         * @param [params.passive=false] - if the queue name doesn't exists the channel will be closed with an error, fulfilled if the queue name does exists
         * @param [params.durable=true] - if the queue should survive server restarts
         * @param [params.autoDelete=false] - if the queue should be deleted when the last consumer of the queue disconnects
         * @param [params.exclusive=false] - if the queue should be deleted when the channel is closed
         * @param args - optional custom queue arguments
         * @return fulfilled when confirmed by the server
         */
        queueDeclare(name?: string, { passive, durable, autoDelete, exclusive }?: QueueParams, args?: {}): Promise<QueueOk>;
        /**
         * Delete a queue
         * @param name - name of the queue, if empty it will delete the last declared queue
         * @param params
         * @param [params.ifUnused=false] - only delete if the queue doesn't have any consumers
         * @param [params.ifEmpty=false] - only delete if the queue is empty
         */
        queueDelete(name?: string, { ifUnused, ifEmpty }?: {
            ifUnused?: boolean;
            ifEmpty?: boolean;
        }): Promise<MessageCount>;
        /**
         * Bind a queue to an exchange
         * @param queue - name of the queue
         * @param exchange - name of the exchange
         * @param routingKey - key to bind with
         * @param args - optional arguments, e.g. for header exchanges
         * @return fulfilled when confirmed by the server
         */
        queueBind(queue: string, exchange: string, routingKey: string, args?: {}): Promise<void>;
        /**
         * Unbind a queue from an exchange
         * @param queue - name of the queue
         * @param exchange - name of the exchange
         * @param routingKey - key that was bound
         * @param args - arguments, e.g. for header exchanges
         * @return fulfilled when confirmed by the server
         */
        queueUnbind(queue: string, exchange: string, routingKey: string, args?: {}): Promise<void>;
        /**
         * Purge a queue
         * @param queue - name of the queue
         * @return fulfilled when confirmed by the server
         */
        queuePurge(queue: string): Promise<MessageCount>;
        /**
         * Declare an exchange
         * @param name - name of the exchange
         * @param type - type of exchange (direct, fanout, topic, header, or a custom type)
         * @param param
         * @param [param.passive=false] - if the exchange name doesn't exists the channel will be closed with an error, fulfilled if the exchange name does exists
         * @param [param.durable=true] - if the exchange should survive server restarts
         * @param [param.autoDelete=false] - if the exchange should be deleted when the last binding from it is deleted
         * @param [param.internal=false] - if exchange is internal to the server. Client's can't publish to internal exchanges.
         * @param args - optional arguments
         * @return Fulfilled when the exchange is created or if it already exists
         */
        exchangeDeclare(name: string, type: ExchangeType, { passive, durable, autoDelete, internal }?: ExchangeParams, args?: {}): Promise<void>;
        /**
         * Delete an exchange
         * @param name - name of the exchange
         * @param param
         * @param [param.ifUnused=false] - only delete if the exchange doesn't have any bindings
         * @return Fulfilled when the exchange is deleted or if it's already deleted
         */
        exchangeDelete(name: string, { ifUnused }?: {
            ifUnused?: boolean;
        }): Promise<void>;
        /**
         * Exchange to exchange binding.
         * @param destination - name of the destination exchange
         * @param source - name of the source exchange
         * @param routingKey - key to bind with
         * @param args - optional arguments, e.g. for header exchanges
         * @return fulfilled when confirmed by the server
         */
        exchangeBind(destination: string, source: string, routingKey?: string, args?: {}): Promise<void>;
        /**
         * Delete an exchange-to-exchange binding
         * @param destination - name of destination exchange
         * @param source - name of the source exchange
         * @param routingKey - key that was bound
         * @param args - arguments, e.g. for header exchanges
         * @return fulfilled when confirmed by the server
         */
        exchangeUnbind(destination: string, source: string, routingKey?: string, args?: {}): Promise<void>;
        /**
         * Set this channel in Transaction mode.
         * Rember to commit the transaction, overwise the server will eventually run out of memory.
         */
        txSelect(): Promise<void>;
        /**
         * Commit a transaction
         */
        txCommit(): Promise<void>;
        /**
         * Rollback a transaction
         */
        txRollback(): Promise<void>;
        private txMethod;
        /**
         * Resolves the next RPC promise
         * @ignore
         */
        resolvePromise(value?: unknown): boolean;
        /**
         * Rejects the next RPC promise
         * @return true if a promise was rejected, otherwise false
         */
        private rejectPromise;
        /**
         * Send a RPC request, will resolve a RPC promise when RPC response arrives
         * @param frame with data
         * @param frameSize - bytes the frame actually is
         */
        private sendRpc;
        /**
         * Marks the channel as closed
         * All outstanding RPC requests will be rejected
         * All outstanding publish confirms will be rejected
         * All consumers will be marked as closed
         * @ignore
         * @param [err] - why the channel was closed
         */
        setClosed(err?: Error): void;
        /**
         * @return Rejected promise with an error
         */
        private rejectClosed;
        /**
         * Called from AMQPBaseClient when a publish is confirmed by the server.
         * Will fulfill one or more (if multiple) Unconfirmed Publishes.
         * @ignore
         * @param deliveryTag
         * @param multiple - true if all unconfirmed publishes up to this deliveryTag should be resolved or just this one
         * @param nack - true if negative confirm, hence reject the unconfirmed publish(es)
         */
        publishConfirmed(deliveryTag: number, multiple: boolean, nack: boolean): void;
        /**
         * Called from AMQPBaseClient when a message is ready
         * @ignore
         * @param message
         */
        onMessageReady(message: AMQPMessage): void;
        /**
         * Deliver a message to a consumer
         * @ignore
         */
        deliver(message: AMQPMessage): void;
    }
    export type QueueOk = {
        name: string;
        messageCount: number;
        consumerCount: number;
    };
    export type MessageCount = {
        messageCount: number;
    };
    export type ExchangeType = 'direct' | 'fanout' | 'topic' | 'headers' | string;
    export type ExchangeParams = {
        /**
         * if the exchange name doesn't exist the channel will be closed with an error, fulfilled if the exchange name does exists
         */
        passive?: boolean;
        /**
         * if the exchange should survive server restarts
         */
        durable?: boolean;
        /**
         * if the exchange should be deleted when the last binding from it is deleted
         */
        autoDelete?: boolean;
        /**
         * if exchange is internal to the server. Client's can't publish to internal exchanges.
         */
        internal?: boolean;
    };
    export type QueueParams = {
        /**
         * if the queue name doesn't exist the channel will be closed with an error, fulfilled if the queue name does exists
         */
        passive?: boolean;
        /**
         * if the queue should survive server restarts
         */
        durable?: boolean;
        /**
         * if the queue should be deleted when the last consumer of the queue disconnects
         */
        autoDelete?: boolean;
        /**
         * if the queue should be deleted when the channel is closed
         */
        exclusive?: boolean;
    };
    export type ConsumeParams = {
        /**
         * tag of the consumer, will be server generated if left empty
         */
        tag?: string;
        /**
         * if messages are removed from the server upon delivery, or have to be acknowledged
         */
        noAck?: boolean;
        /**
         * if this can be the only consumer of the queue, will return an Error if there are other consumers to the queue already
         */
        exclusive?: boolean;
        /**
         * custom arguments
         */
        args?: Record<string, any>;
    };
}
declare module "amqp-base-client" {
    import { AMQPChannel } from "amqp-channel";
    import { AMQPError } from "amqp-error";
    import { AMQPView } from "amqp-view";
    /**
     * Base class for AMQPClients.
     * Implements everything except how to connect, send data and close the socket
     */
    export abstract class AMQPBaseClient {
        vhost: string;
        username: string;
        password: string;
        name?: string;
        platform?: string;
        channels: AMQPChannel[];
        protected connectPromise?: [(conn: AMQPBaseClient) => void, (err: Error) => void];
        protected closePromise?: [(value?: void) => void, (err: Error) => void];
        closed: boolean;
        blocked?: string;
        channelMax: number;
        frameMax: number;
        heartbeat: number;
        onerror: (error: AMQPError) => void;
        /** Used for string -> arraybuffer when publishing */
        readonly textEncoder: TextEncoder;
        readonly bufferPool: AMQPView[];
        /**
         * @param name - name of the connection, set in client properties
         * @param platform - used in client properties
         */
        constructor(vhost: string, username: string, password: string, name?: string, platform?: string, frameMax?: number, heartbeat?: number);
        /**
         * Open a channel
         * @param [id] - An existing or non existing specific channel
         */
        channel(id?: number): Promise<AMQPChannel>;
        /**
         * Gracefully close the AMQP connection
         * @param [reason] might be logged by the server
         */
        close(reason?: string, code?: number): Promise<void>;
        /**
         * Try establish a connection
         */
        abstract connect(): Promise<AMQPBaseClient>;
        /**
         * @ignore
         * @param bytes to send
         * @return fulfilled when the data is enqueued
         */
        abstract send(bytes: Uint8Array): Promise<void>;
        protected abstract closeSocket(): void;
        private rejectClosed;
        private rejectConnect;
        /**
         * Parse and act on frames in an AMQPView
         * @ignore
         */
        protected parseFrames(view: AMQPView): void;
    }
}
declare module "amqp-tls-options" {
    import { TlsOptions } from 'tls';
    /** Additional TLS options, for more info check https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions
     *  @cert Cert chains in PEM format. One cert chain should be provided per private key.
     *  @key Private keys in PEM format. PEM allows the option of private keys being encrypted.
     *        Encrypted keys will be decrypted with AMQPTlsOptions.passphrase.
     *  @pfx PFX or PKCS12 encoded private key and certificate chain.
     *       pfx is an alternative to providing key and cert individually.
     *       PFX is usually encrypted, if it is, passphrase will be used to decrypt it.
     *  @passphrase Shared passphrase used for a single private key and/or a PFX.
     *  @ca Optionally override the trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla.
    */
    export type AMQPTlsOptions = Pick<TlsOptions, "key" | "cert" | "pfx" | "passphrase" | "ca">;
}
declare module "amqp-socket-client" {
    import { AMQPBaseClient } from "amqp-base-client";
    import { AMQPTlsOptions } from "amqp-tls-options";
    import * as net from 'net';
    /**
     * AMQP 0-9-1 client over TCP socket.
     */
    export class AMQPClient extends AMQPBaseClient {
        socket?: net.Socket | undefined;
        readonly tls: boolean;
        readonly host: string;
        readonly port: number;
        readonly tlsOptions: AMQPTlsOptions | undefined;
        private readonly insecure;
        private framePos;
        private frameSize;
        private readonly frameBuffer;
        /**
         * @param url - uri to the server, example: amqp://user:passwd@localhost:5672/vhost
         */
        constructor(url: string, tlsOptions?: AMQPTlsOptions);
        connect(): Promise<AMQPBaseClient>;
        private connectSocket;
        private onRead;
        /**
         * @ignore
         * @param bytes to send
         * @return fulfilled when the data is enqueued
         */
        send(bytes: Uint8Array): Promise<void>;
        protected closeSocket(): void;
    }
}
declare module "amqp-client" {
    export { AMQPClient } from "amqp-socket-client";
    export { AMQPChannel } from "amqp-channel";
    export { AMQPQueue } from "amqp-queue";
    export { AMQPConsumer } from "amqp-consumer";
    export { AMQPError } from "amqp-error";
    export { AMQPMessage } from "amqp-message";
    export { AMQPProperties, Field } from "amqp-properties";
}
declare module "amqp-websocket-client" {
    import { AMQPBaseClient } from "amqp-base-client";
    /**
     * WebSocket client for AMQP 0-9-1 servers
     */
    export class AMQPWebSocketClient extends AMQPBaseClient {
        readonly url: string;
        private socket?;
        private framePos;
        private frameSize;
        private frameBuffer;
        /**
         * @param url to the websocket endpoint, example: wss://server/ws/amqp
         */
        constructor(url: string, vhost?: string, username?: string, password?: string, name?: string, frameMax?: number, heartbeat?: number);
        /**
         * Establish a AMQP connection over WebSocket
         */
        connect(): Promise<AMQPBaseClient>;
        /**
         * @param bytes to send
         * @return fulfilled when the data is enqueued
         */
        send(bytes: Uint8Array): Promise<void>;
        protected closeSocket(): void;
        private handleMessage;
        static platform(): string;
    }
}
declare module "index" {
    export { AMQPClient } from "amqp-socket-client";
    export { AMQPWebSocketClient } from "amqp-websocket-client";
    export { AMQPChannel, QueueOk, MessageCount, QueueParams, ExchangeParams, ConsumeParams } from "amqp-channel";
    export { AMQPQueue } from "amqp-queue";
    export { AMQPConsumer } from "amqp-consumer";
    export { AMQPError } from "amqp-error";
    export { AMQPMessage } from "amqp-message";
    export { AMQPProperties, Field } from "amqp-properties";
    export { AMQPTlsOptions } from "amqp-tls-options";
}
