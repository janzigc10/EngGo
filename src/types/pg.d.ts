declare module "pg" {
  export type QueryResult<Row = unknown> = {
    rows: Row[];
  };

  export type ClientConfig = {
    connectionString?: string;
  };

  export class Client {
    constructor(config?: ClientConfig);

    connect(): Promise<void>;
    end(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): this;
    query<Row = unknown>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;
  }
}
