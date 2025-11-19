import { Controller, Get, Query, Render, Param, Post, Redirect, Body } from '@nestjs/common';
import { WebappService } from './webapp.service';

@Controller('webapp')
export class WebappController {
  constructor(private readonly webappService: WebappService) {}

  @Get('requests')
  @Render('requests')
  async getRequests(
    @Query('userId') userId: string,
    @Query('role') role: string,
    @Query('search') search: string,
    @Query('status') status: string,
  ) {
    const requests = await this.webappService.getRequests(
      userId,
      role,
      search,
      status,
    );
    return { requests, userId, role }; // Pass userId and role to the view
  }

  @Get('responses')
  @Render('responses')
  async getResponses(
    @Query('userId') userId: string,
    @Query('role') role: string,
    @Query('search') search: string,
    @Query('status') status: string,
  ) {
    const responses = await this.webappService.getResponses(
      userId,
      role,
      search,
      status,
    );
    return { responses };
  }

  @Get('requests/:id')
  @Render('request-detail')
  async getRequest(
    @Param('id') id: string,
    @Query('userId') userId: string, // Pass userId to the view
    @Query('role') role: string, // Pass role to the view
  ) {
    const request = await this.webappService.getRequest(id);
    return { request, userId, role }; // Return userId and role
  }

  @Get('responses/:id')
  @Render('response-detail')
  async getResponse(@Param('id') id: string) {
    const response = await this.webappService.getResponse(id);
    return { response };
  }

  @Get('open-requests')
  @Render('open-requests')
  async getOpenRequests(@Query('userId') userId: string) { // Accept userId here
    const requests = await this.webappService.getOpenRequests();
    return { requests, userId }; // Pass userId to the view
  }

  @Post('responses/:id/choose')
  @Redirect()
  async chooseResponse(@Param('id') id: string) {
    const response = await this.webappService.chooseResponse(id);
    return { url: `/webapp/requests/${response.request_id}` };
  }

  @Post('send-response-prompt')
  @Redirect('https://t.me/snab_design_bot') // Redirect to the bot
  async sendResponsePrompt(
    @Body('requestId') requestId: string,
    @Body('supplierTelegramId') supplierTelegramId: string,
  ) {
    await this.webappService.sendResponsePromptToSupplier(
      requestId,
      supplierTelegramId,
    );
    return { url: 'https://t.me/snab_design_bot' }; // Redirect to bot after sending message
  }

  @Post('requests/:id/status')
  @Redirect()
  async updateRequestStatus(
    @Param('id') id: string,
    @Body('status') status: 'OPEN' | 'CLOSED',
    @Body('designerId') designerId: string, // Assuming designerId is passed for redirect
  ) {
    await this.webappService.updateRequestStatus(id, status);
    return { url: `/webapp/requests/${id}?userId=${designerId}&role=designer` }; // Redirect back to the request detail page
  }
}
