import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BotService } from '@/bot/bot.service';
import { Markup } from 'telegraf'; // Import Markup

@Injectable()
export class WebappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
  ) {}

  private truncateText(text: string | null, maxLength: number = 100): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  async getRequests(
    userId: string,
    role: string,
    search?: string,
    status?: string,
  ) {
    if (role === 'designer') {
      const requests = await this.prisma.request.findMany({
        where: {
          designer_id: userId,
          ...(status && { status }),
          ...(search && {
            details_text: { contains: search, mode: 'insensitive' },
          }),
        },
        include: { request_files: { include: { directus_files: true } } },
      });
      requests.forEach((req) => {
        this.addPhotoUrls(req.request_files);
        req.details_text = this.truncateText(req.details_text); // Truncate for list view
      });
      return requests;
    }
    return [];
  }

  async getResponses(
    userId: string,
    role: string,
    search?: string,
    status?: string,
  ) {
    if (role === 'supplier') {
      const responses = await this.prisma.response.findMany({
        where: {
          supplier_id: userId,
          ...(status && { status }),
          ...(search && {
            request: {
              details_text: { contains: search, mode: 'insensitive' },
            },
          }),
        },
        include: {
          request: {
            include: { request_files: { include: { directus_files: true } } },
          },
          response_files: { include: { directus_files: true } },
        },
        orderBy: {
          status: 'asc', // Sort by status, CHOSEN first
        },
      });
      responses.forEach((res) => {
        if (res.request) {
          this.addPhotoUrls(res.request.request_files);
          res.request.details_text = this.truncateText(
            res.request.details_text,
          ); // Truncate for list view
        }
        this.addPhotoUrls(res.response_files);
        res.details_text = this.truncateText(res.details_text); // Truncate for list view
      });
      return responses;
    }
    return [];
  }

  async getRequest(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        request_files: { include: { directus_files: true } },
        response: {
          include: {
            response_files: { include: { directus_files: true } },
            user: true,
          },
        },
      },
    });
  
    let hasChosenSupplier = false;
    if (request) {
      this.addPhotoUrls(request.request_files);
      request.response.forEach((response) => {
        this.addPhotoUrls(response.response_files);
        if (response.status === 'CHOSEN') {
          hasChosenSupplier = true;
        }
      });
    }
  
    return { ...request, hasChosenSupplier };
  }

  async getResponse(id: string) {
    const response = await this.prisma.response.findUnique({
      where: { id },
      include: {
        request: {
          include: { request_files: { include: { directus_files: true } } },
        },
        response_files: { include: { directus_files: true } },
      },
    });

    if (response) {
      this.addPhotoUrls(response.response_files);
      if (response.request) {
        this.addPhotoUrls(response.request.request_files);
      }
    }
    return response;
  }

  async getOpenRequests() {
    const requests = await this.prisma.request.findMany({
      where: { status: 'OPEN' },
      include: { request_files: { include: { directus_files: true } } },
    });
    requests.forEach((req) => {
      this.addPhotoUrls(req.request_files);
      req.details_text = this.truncateText(req.details_text); // Truncate for list view
    });
    return requests;
  }

  async chooseResponse(responseId: string) {
    // Only update the response status to CHOSEN
    const updatedResponse = await this.prisma.response.update({
      where: { id: responseId },
      data: { status: 'CHOSEN' },
      include: {
        request: { include: { user: true } },
        user: true,
      },
    });
  
    if (
      !updatedResponse ||
      !updatedResponse.request ||
      !updatedResponse.user ||
      !updatedResponse.request.user
    ) {
      throw new Error('Could not retrieve all parties for contact exchange.');
    }
  
    const designer = updatedResponse.request.user;
    const supplier = updatedResponse.user;
  
    // Send notifications
    if (designer.telegram_id) {
      await this.botService.sendMessage(
        designer.telegram_id,
        `Вы выбрали поставщика для заявки "${updatedResponse.request.details_text}".\nКонтакты: ${supplier.contact_info || 'Не указаны'}`,
      );
    }
    if (supplier.telegram_id) {
      await this.botService.sendMessage(
        supplier.telegram_id,
        `Вас выбрали для заявки "${updatedResponse.request.details_text}"!\nКонтакты дизайнера: ${designer.contact_info || 'Не указаны'}`,
      );
    }
  
    return updatedResponse;
  }

  async sendResponsePromptToSupplier(
    requestId: string,
    supplierTelegramId: string,
  ) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { request_files: true },
    });

    if (!request) {
      throw new Error(`Request with ID ${requestId} not found.`);
    }

    const supplier = await this.prisma.user.findUnique({
      where: { telegram_id: supplierTelegramId },
    });

    if (!supplier) {
      throw new Error(`Supplier with Telegram ID ${supplierTelegramId} not found.`);
    }

    await this.botService.sendRequestToSupplier(request, supplier);
  }

  async updateRequestStatus(requestId: string, status: 'OPEN' | 'CLOSED') {
    return this.prisma.request.update({
      where: { id: requestId },
      data: { status },
    });
  }

  private addPhotoUrls(files: any[]) {
    const directusUrl = process.env.DIRECTUS_URL;
    if (!directusUrl || !files) return;

    files.forEach((file) => {
      if (file.directus_files) {
        file.directus_files.photo_url = `${directusUrl}/assets/${file.directus_files.id}`;
      }
    });
  }
}
