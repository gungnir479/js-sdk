import { AdminApiClient } from "../AdminApiClient";
import { HaloRestAPIClient } from "../../../rest-api-client";

describe("Halo admin api test", () => {
  let client: AdminApiClient;

  beforeEach(() => {
    let haloRestApiClient = new HaloRestAPIClient({
      baseUrl: "http://127.0.0.1:8090",
      auth: {
        type: "customizeAuth",
        headerName: "Admin-Authorization",
        getToken() {
          return "2a306784371a44818cbb5fb45c35592d"
        }
      }
    });
    client = new AdminApiClient(haloRestApiClient);
  })

  it("getEnvironment", async () => {
    let result = await client.getEnvironment();
    console.log(result)
  })

  it("getLogFile", async () => {
    let result = await client.getLogFile(10);
    expect(result).toStrictEqual({ status: 200, message: 'OK', devMessage: null, data: '' })
  })

  it("isInstalled", async () => {
    let result = await client.isInstalled();
    console.log(result)
  })

  it("listAttachments", async () => {
    let result = await client.listAttachments({
      page: 1,
      size: 20
    });
    console.log(result)
  })

  it("listAttachments", async () => {
    let result = await client.listMenusTreeView();
    console.log(result)
  })
});