export class AddChatMessageVisibility1757139240003 {
    name = 'AddChatMessageVisibility1757139240003'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_message" ADD "visibleUserIds" text[]`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "visibleUserIds"`);
    }
}
