import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as FormData from 'form-data';
import axios, { AxiosResponse } from 'axios';

interface DirectusFile {
  id: string;
  // Add other properties you might need from the Directus file object
}

interface DirectusError {
  response?: {
    data?: {
      errors?: { message: string }[];
    };
  };
  message: string;
}

function isDirectusError(error: unknown): error is DirectusError {
  const err = error as DirectusError;
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    (!err.response ||
      (typeof err.response === 'object' &&
        err.response !== null &&
        (!err.response.data ||
          (typeof err.response.data === 'object' &&
            err.response.data !== null &&
            (!err.response.data.errors ||
              Array.isArray(err.response.data.errors))))))
  );
}

@Injectable()
export class DirectusService {
  private readonly logger = new Logger(DirectusService.name);
  private readonly directusUrl: string;
  private readonly directusToken: string;

  constructor(private readonly configService: ConfigService) {
    const directusUrl = this.configService.get<string>('DIRECTUS_URL');
    const directusToken = this.configService.get<string>('DIRECTUS_TOKEN');

    if (!directusUrl) {
      this.logger.error('DIRECTUS_URL is not set in environment variables.');
      throw new Error('Directus URL configuration missing.');
    }
    if (!directusToken) {
      this.logger.error('DIRECTUS_TOKEN is not set in environment variables.');
      throw new Error('Directus Token configuration missing.');
    }

    this.directusUrl = directusUrl;
    this.directusToken = directusToken;
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('title', fileName);
      formData.append('type', mimeType);
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: mimeType,
      });

      const response: AxiosResponse<{ data: DirectusFile }> = await axios.post(
        `${this.directusUrl}/files`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.directusToken}`,
          },
        },
      );

      const uploadedFile = response.data.data;

      if (!uploadedFile || !uploadedFile.id) {
        return Promise.reject(
          new Error('Uploaded file ID is missing from Directus response.'),
        );
      }

      this.logger.log(`File uploaded to Directus: ${uploadedFile.id}`);
      return uploadedFile.id;
    } catch (error) {
      const errorMessage = isDirectusError(error)
        ? error.response?.data?.errors?.[0]?.message || error.message
        : 'An unknown error occurred';
      this.logger.error('Failed to upload file to Directus:', errorMessage);
      throw new Error(`Directus file upload failed: ${errorMessage}`);
    }
  }

  getFileUrl(fileId: string): string {
    return `${this.directusUrl}/assets/${fileId}`;
  }

  async fetchFileBuffer(fileId: string): Promise<Buffer> {
    try {
      const url = this.getFileUrl(fileId);
      const response: AxiosResponse<Buffer> = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          Authorization: `Bearer ${this.directusToken}`,
        },
      });
      return response.data;
    } catch (error) {
      const errorMessage = isDirectusError(error)
        ? error.response?.data?.errors?.[0]?.message || error.message
        : 'An unknown error occurred';
      this.logger.error(
        `Failed to fetch file ${fileId} from Directus:`,
        errorMessage,
      );
      throw new Error(`Directus file fetch failed: ${errorMessage}`);
    }
  }
}
