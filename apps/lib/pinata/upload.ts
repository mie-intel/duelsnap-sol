import { PinataSDK } from "pinata";
import { ipfsUrl } from "../ipfs";

function getPinataJwt() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT is not configured");
  return jwt;
}

const pinata = new PinataSDK({
  pinataJwt: getPinataJwt(),
  pinataGateway:
    process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud",
});

export async function uploadImageToIPFS(file: File): Promise<string> {
  const result = await pinata.upload.public.file(file);
  return result.cid;
}

export function getIPFSUrl(hash: string): string {
  return ipfsUrl(hash);
}
